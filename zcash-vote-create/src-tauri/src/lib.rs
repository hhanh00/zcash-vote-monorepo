use std::fs::File;

use anyhow::Error;
use bip0039::Mnemonic;
use orchard::keys::{FullViewingKey, Scope, SpendingKey};
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use zcash_vote::{
    address::VoteAddress,
    db::create_schema,
    download::download_reference_data,
    election::{CandidateChoice, Election},
    trees::{compute_cmx_root, compute_nf_root},
};

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ElectionTemplate {
    name: String,
    start: u32,
    end: u32,
    question: String,
    choices: String,
    signature_required: bool,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ElectionData {
    pub seed: String,
    pub election: Election,
}

#[tauri::command]
async fn create_election(
    election: ElectionTemplate,
    channel: Channel<u32>,
) -> Result<String, String> {
    let e = async {
        let mnemonic = Mnemonic::generate(bip0039::Count::Words24);
        let phrase = mnemonic.phrase().to_string();
        let seed = mnemonic.to_seed("vote");
        let candidates = election
            .choices
            .trim()
            .split("\n")
            .enumerate()
            .map(|(i, choice)| {
                let spk = SpendingKey::from_zip32_seed(&seed, 133, i as u32).unwrap();
                let fvk = FullViewingKey::from(&spk);
                let address = fvk.address_at(0u64, Scope::External);
                let vote_address = VoteAddress(address);

                CandidateChoice {
                    address: vote_address.to_string(),
                    choice: choice.to_string(),
                }
            })
            .collect::<Vec<_>>();

        let manager = SqliteConnectionManager::memory();
        let pool = Pool::new(manager)?;

        let start = election.start;
        let end = election.end;

        let mut e = Election {
            name: election.name,
            start_height: start,
            end_height: end,
            question: election.question,
            candidates,
            signature_required: election.signature_required,
            cmx: Default::default(),
            nf: Default::default(),
            cmx_frontier: Default::default(),
        };

        let connection = pool.get()?;
        create_schema(&connection)?;

        connection.execute("BEGIN TRANSACTION", [])?;
        let lwd_url = std::env::var("LWD_URL").unwrap_or("https://zec.rocks".to_string());
        let ch = channel.clone();
        let (connection, _) =
            download_reference_data(connection, 0, &e, None, orchard::keys::Scope::External,
                &lwd_url, move |h| {
                let p = (100 * (h - start)) / (end - start) / 2;
                let _ = ch.send(p);
            })
            .await?;

        let nf_root = compute_nf_root(&connection)?;
        channel.send(75)?;
        let (cmx_root, frontier) = compute_cmx_root(&connection)?;
        channel.send(100)?;
        connection.execute("COMMIT", [])?;

        e.nf = nf_root;
        e.cmx = cmx_root;
        e.cmx_frontier = frontier;

        let e = ElectionData {
            seed: phrase,
            election: e,
        };

        let e = serde_json::to_string(&e)?;

        Ok::<_, Error>(e)
    };
    e.await.map_err(|e| e.to_string())
}

#[tauri::command]
fn save_election(path: String, election: Election) -> Result<(), String> {
    let r = || {
        let mut f = File::create(path)?;
        serde_json::to_writer(&mut f, &election)?;
        Ok::<_, Error>(())
    };
    r().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_election_id(election: Election) -> String {
    election.id()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![create_election, get_election_id, save_election])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
