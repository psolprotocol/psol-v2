#!/bin/bash
# ============================================================================
# pSOL v2 - Program Keypair Generation Script
# ============================================================================
#
# This script generates program keypairs for different environments.
# Store mainnet keypairs securely - they control your program forever!
#
# Usage:
#   chmod +x generate-keys.sh
#   ./generate-keys.sh
#
# ============================================================================

set -e

KEYS_DIR="keys"
mkdir -p "$KEYS_DIR"

echo "=============================================="
echo "  pSOL v2 Program Keypair Generator"
echo "=============================================="
echo ""

# Check if solana-keygen is available
if ! command -v solana-keygen &> /dev/null; then
    echo "ERROR: solana-keygen not found"
    echo "Install Solana CLI: sh -c \"\$(curl -sSfL https://release.solana.com/v1.18.0/install)\""
    exit 1
fi

# Generate localnet keypair (no vanity prefix - fast)
echo "[1/3] Generating localnet keypair..."
if [ ! -f "$KEYS_DIR/psol-localnet.json" ]; then
    solana-keygen new --no-bip39-passphrase --outfile "$KEYS_DIR/psol-localnet.json" --force
    LOCALNET_ID=$(solana-keygen pubkey "$KEYS_DIR/psol-localnet.json")
    echo "  Localnet Program ID: $LOCALNET_ID"
else
    echo "  Skipped (already exists)"
    LOCALNET_ID=$(solana-keygen pubkey "$KEYS_DIR/psol-localnet.json")
fi

# Generate devnet keypair with vanity prefix
echo ""
echo "[2/3] Generating devnet keypair with 'PSoL' prefix..."
echo "  This may take a few minutes..."
if [ ! -f "$KEYS_DIR/psol-devnet.json" ]; then
    solana-keygen grind --starts-with PSoL:1 --ignore-case
    # Move the generated file
    DEVNET_FILE=$(ls PSoL*.json 2>/dev/null | head -1)
    if [ -n "$DEVNET_FILE" ]; then
        mv "$DEVNET_FILE" "$KEYS_DIR/psol-devnet.json"
        DEVNET_ID=$(solana-keygen pubkey "$KEYS_DIR/psol-devnet.json")
        echo "  Devnet Program ID: $DEVNET_ID"
    else
        echo "  ERROR: Vanity key generation failed"
        exit 1
    fi
else
    echo "  Skipped (already exists)"
    DEVNET_ID=$(solana-keygen pubkey "$KEYS_DIR/psol-devnet.json")
fi

# Generate mainnet keypair with vanity prefix
echo ""
echo "[3/3] Generating mainnet keypair with 'PSoL' prefix..."
echo "  This may take a few minutes..."
echo "  ⚠️  STORE THIS KEYPAIR SECURELY!"
if [ ! -f "$KEYS_DIR/psol-mainnet.json" ]; then
    solana-keygen grind --starts-with PSoL:1 --ignore-case
    # Move the generated file
    MAINNET_FILE=$(ls PSoL*.json 2>/dev/null | head -1)
    if [ -n "$MAINNET_FILE" ]; then
        mv "$MAINNET_FILE" "$KEYS_DIR/psol-mainnet.json"
        MAINNET_ID=$(solana-keygen pubkey "$KEYS_DIR/psol-mainnet.json")
        echo "  Mainnet Program ID: $MAINNET_ID"
    else
        echo "  ERROR: Vanity key generation failed"
        exit 1
    fi
else
    echo "  Skipped (already exists)"
    MAINNET_ID=$(solana-keygen pubkey "$KEYS_DIR/psol-mainnet.json")
fi

# Display summary
echo ""
echo "=============================================="
echo "  Keypairs Generated Successfully!"
echo "=============================================="
echo ""
echo "Program IDs:"
echo "  Localnet: $LOCALNET_ID"
echo "  Devnet:   $DEVNET_ID"
echo "  Mainnet:  $MAINNET_ID"
echo ""
echo "Files created in $KEYS_DIR/:"
ls -la "$KEYS_DIR/"
echo ""

# Generate lib.rs snippet
echo "=============================================="
echo "  Update lib.rs with these IDs:"
echo "=============================================="
echo ""
cat << EOF
// Localnet/default program ID
#[cfg(not(any(feature = "devnet", feature = "mainnet")))]
declare_id!("$LOCALNET_ID");

// Devnet program ID
#[cfg(feature = "devnet")]
declare_id!("$DEVNET_ID");

// Mainnet program ID
#[cfg(feature = "mainnet")]
declare_id!("$MAINNET_ID");
EOF
echo ""

# Security reminder
echo "=============================================="
echo "  ⚠️  SECURITY REMINDERS"
echo "=============================================="
echo ""
echo "1. NEVER commit mainnet keypair to git!"
echo "2. Add to .gitignore:"
echo "   echo 'keys/psol-mainnet.json' >> .gitignore"
echo ""
echo "3. Backup mainnet keypair to secure storage:"
echo "   - Hardware wallet"
echo "   - Encrypted cloud storage"
echo "   - Physical paper backup"
echo ""
echo "4. The program ID is permanent - you cannot change it after deployment!"
echo ""
echo "Done!"
