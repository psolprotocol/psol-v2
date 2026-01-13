const anchor = require('@coral-xyz/anchor');
const fs = require('fs');
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const idl = JSON.parse(fs.readFileSync('target/idl/psol_privacy_v2.json', 'utf8'));
const program = new anchor.Program(idl, provider);
const { PublicKey } = anchor.web3;

const POOL = new PublicKey('DPZe7uST1mBxzVkEm215epHjsM7Sa8VCXHr3pv4eLp8X');
const MERKLE = new PublicKey('3NPUEWkbkyv7XDjVg98CWmkUz1XFNZ6ogqi18AiTnqgm');
const PENDING = new PublicKey('DPxeTsLkZaWdenw6gqgU7M6arWhKbo99GDVf2gPtM4NH');

Promise.all([
  program.account.poolConfigV2.fetch(POOL),
  program.account.merkleTreeV2.fetch(MERKLE),
  program.account.pendingDepositsBuffer.fetch(PENDING)
]).then(([pool, tree, pending]) => {
  console.log('=== DEVNET STATE ===');
  console.log('Pool paused:', pool.isPaused);
  console.log('Pool authority:', pool.authority.toBase58());
  console.log('Merkle next_leaf_index:', tree.nextLeafIndex);
  console.log('Merkle root:', Buffer.from(tree.currentRoot).toString('hex').slice(0,16) + '...');
  console.log('Pending deposits:', pending.totalPending);
  console.log('✅ State check complete');
});
