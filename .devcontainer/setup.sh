#!/bin/bash
set -e

echo "=== Installing Solana CLI 1.18.17 ==="
sh -c "$(curl -sSfL https://release.anza.xyz/v1.18.17/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.bashrc

echo "=== Configuring Solana ==="
solana config set --url localhost
solana-keygen new --no-bip39-passphrase --force

echo "=== Installing Anchor 0.29.0 ==="
cargo install --git https://github.com/coral-xyz/anchor --tag v0.29.0 anchor-cli --locked

echo "=== Installing Yarn ==="
npm install -g yarn

echo "=== Verification ==="
solana --version
anchor --version
rustc --version

echo "=== Setup Complete! ==="
