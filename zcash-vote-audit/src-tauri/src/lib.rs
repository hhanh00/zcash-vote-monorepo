use std::collections::BTreeSet;

use anyhow::Error;
use bip0039::Mnemonic;
use orchard::{keys::{FullViewingKey, PreparedIncomingViewingKey, Scope, SpendingKey}, vote::{try_decrypt_ballot, validate_ballot, Ballot, BallotData, OrchardHash}};
use pasta_curves::{group::ff::PrimeField, Fp};
use serde::{Deserialize, Serialize};
use zcash_vote::{
    address::VoteAddress,
    as_byte256,
    election::{Election, BALLOT_VK},
};

#[derive(Clone, Debug)]
pub struct Count(PreparedIncomingViewingKey, FullViewingKey, u64);

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct CountResult {
    choice: String,
    amount: u64,
}

#[tauri::command]
async fn audit(url: String, seed: String) -> Result<Vec<CountResult>, String> {
    let res = async {
        let election: Election = reqwest::get(&url).await?.json().await?;
        let mnemonic = Mnemonic::from_phrase(&seed)?;
        let seed = mnemonic.to_seed("vote");
        let mut counts = vec![];
        for (i, c) in election.candidates.iter().enumerate() {
            let sk = SpendingKey::from_zip32_seed(&seed, 133, i as u32).unwrap();
            let fvk = FullViewingKey::from(&sk);
            let address = fvk.address_at(0u64, Scope::External);
            let vote_address = VoteAddress::decode(&c.address)?;
            if vote_address.0 != address {
                anyhow::bail!("Invalid address for choice #{i}");
            }
            let ivk = fvk.to_ivk(Scope::External);
            let pivk = PreparedIncomingViewingKey::new(&ivk);
            counts.push(Count(pivk, fvk, 0u64));
        }

        let mut candidate_nfs = vec![];
        let mut frontier = election.cmx_frontier.clone().unwrap();
        let mut cmx_roots = BTreeSet::<Fp>::new();
        cmx_roots.insert(Fp::from_repr(election.cmx.0).unwrap());
        let mut nfs = BTreeSet::<Fp>::new();
        let n = reqwest::get(&format!("{url}/num_ballots"))
            .await?
            .text()
            .await?;
        let n = n.parse::<u32>()?;
        for i in 1..=n {
            let ballot: Ballot = reqwest::get(&format!("{url}/ballot/height/{i}"))
                .await?
                .json()
                .await?;
            let BallotData {
                version,
                domain,
                actions,
                anchors,
            } = ballot.data.clone();
            if version != 1 {
                anyhow::bail!("Invalid version");
            }
            let domain = Fp::from_repr(as_byte256(&domain)).unwrap();
            if domain != election.domain() {}
            let nf = &anchors.nf;
            if nf != &election.nf.0 {
                anyhow::bail!("nf roots do not match");
            }
            let cmx = Fp::from_repr(as_byte256(&anchors.cmx)).unwrap();
            if !cmx_roots.contains(&cmx) {
                anyhow::bail!("cmx roots do not match");
            }

            for action in actions.iter() {
                let nf = Fp::from_repr(as_byte256(&action.nf)).unwrap();
                if nfs.contains(&nf) {
                    anyhow::bail!("duplicate dnf");
                }
                nfs.insert(nf);
                frontier.append(OrchardHash(as_byte256(&action.cmx)));
                for c in counts.iter_mut() {
                    if let Some(note) = try_decrypt_ballot(&c.0, action)? {
                        let candidate_nf = note.nullifier_domain(&c.1, domain);
                        candidate_nfs.push(Fp::from_repr(candidate_nf.to_bytes()).unwrap());
                        c.2 += note.value().inner();
                    }
                }
            }
            cmx_roots.insert(Fp::from_repr(frontier.root()).unwrap());

            validate_ballot(ballot, election.signature_required, &BALLOT_VK)?;
        }

        // Check that candidate notes are unspent
        for dnf in candidate_nfs.iter() {
            if nfs.contains(dnf) {
                anyhow::bail!("candidate notes cannot be spent");
            }
        }

        let res = counts
            .iter()
            .zip(election.candidates.iter())
            .map(|(c, cc)| CountResult {
                choice: cc.choice.clone(),
                amount: c.2,
            })
            .collect::<Vec<_>>();
        Ok::<_, Error>(res)
    };

    res.await.map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![audit])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
