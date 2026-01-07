# Stop-Ship List

1.  **Inconsistent `asset_id` Derivation:** The on-chain program, SDK, and relayer use different methods to derive the `asset_id` from a token mint. This will cause all `register_asset` transactions to fail and prevent any assets from being added to the pool.
2.  **Inconsistent Public Key to Field Element Encoding:** The on-chain program and the SDK/relayer use different methods to encode a Solana public key into a field element for zk-proofs. This will cause all proofs to fail on-chain verification, making deposits and withdrawals impossible.
3.  **Merkle Tree Depth Mismatch:** The circuits are hardcoded for a tree of depth 20, while the deployment scripts initialize an on-chain tree of depth 4. This incompatibility ensures no withdrawal can ever succeed.
