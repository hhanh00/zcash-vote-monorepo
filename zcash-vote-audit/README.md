The `zcash-vote-audit` tool
- verifies the ballots[^1],
- tallies the votes and
- reports the result of an election.

It connects to a `zcash-vote-server` to
retrieve the ballots and decrypts them with
the *election seed phrase*.

## Public Vote Server

If the tool is used with a public/official
vote server, the audit *trusts* the correctness
of the ballots it gets. Ballots cannot be
forged because of the ZKP and signatures they
contain, but a vote server may be *omitting*
certain ballots.

Therefore, auditors are *highly recommended*
to deploy and use their own vote server.
This guarantees that the ballots they have
are the complete set. The BFT
engine will detect any attempt at tampering
with the voting blockchain.

## Local Vote Server

1. See the [zcash-vote server project](https://github.com/hhanh00/zcash-vote-server/blob/main/doc/deploy.md) for information
on how to install and run the zcash-vote server.
2. You should generate your own node key but
use the `genesis.json` file from the election.
3. Get the peer address of one of the validators
and put it in the `persistent_peers` field of
the config file. The genesis and validator addresses
should be make public by the organizers.
4. Run `cometbft start` and `zcash-vote-server`
5. Your machine should connect to the validator,
download and validate ballots locally.
6. Finally, run `zcash-vote-audit` with the URL
of the local server, i.e. `http://localhost:8000/election/<id>`

[^1]: It checks the signatures, the ZKP
and that candidate votes were not redirected.
