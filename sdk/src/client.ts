import { AnchorProvider, Program, BN, Idl } from '@coral-xyz/anchor';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  TransactionSignature,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';

import {
  InitializePoolRequest,
  InitializePoolResult,
  RegisterAssetRequest,
  DepositRequest,
  DepositResult,
  WithdrawRequest,
  WithdrawResult,
  SetVerificationKeyRequest,
  RegisterRelayerRequest,
  UpdateRelayerRequest,
  ConfigureRelayerRegistryRequest,
  ConfigureComplianceRequest,
  ConfigureAssetRequest,
  PoolConfigV2,
  MerkleTreeV2,
  AssetVault,
  VerificationKeyAccountV2,
  RelayerRegistry,
  RelayerNode,
  RelayerInfo,
  ComplianceConfig,
  ProofType,
  AssetId,
  Commitment,
  NullifierHash,
  MerkleRoot,
  toBN,
  PROOF_SIZE,
} from './types';

import {
  findPoolConfigPda,
  findMerkleTreePda,
  findAssetVaultPda,
  findVerificationKeyPda,
  findSpentNullifierPda,
  findRelayerRegistryPda,
  findRelayerNodePda,
  findComplianceConfigPda,
  computeAssetId,
  derivePoolPdas,
  PROGRAM_ID,
} from './pda';

import IDL from './idl/psol_privacy_v2.json';

/**
 * Options for creating a PsolV2Client
 */
export interface PsolV2ClientOptions {
  /** Anchor provider (preferred) */
  provider?: AnchorProvider;
  /** Connection (alternative to provider) */
  connection?: Connection;
  /** Wallet keypair (required if using connection) */
  wallet?: Keypair;
  /** Custom program ID (defaults to PROGRAM_ID) */
  programId?: PublicKey;
}

/**
 * Main client for interacting with the pSOL v2 MASP protocol
 */
export class PsolV2Client {
  public readonly program: Program;
  public readonly provider: AnchorProvider;
  public readonly programId: PublicKey;

  constructor(options: PsolV2ClientOptions) {
    this.programId = options.programId ?? PROGRAM_ID;

    if (options.provider) {
      this.provider = options.provider;
    } else if (options.connection && options.wallet) {
      // Create a simple wallet adapter from keypair
      const wallet = {
        publicKey: options.wallet.publicKey,
        signTransaction: async (tx: any) => {
          tx.sign(options.wallet!);
          return tx;
        },
        signAllTransactions: async (txs: any[]) => {
          txs.forEach((tx) => tx.sign(options.wallet!));
          return txs;
        },
      };
      this.provider = new AnchorProvider(options.connection, wallet as any, {
        commitment: 'confirmed',
      });
    } else {
      throw new Error('Either provider or connection+wallet must be provided');
    }

    this.program = new Program(IDL as Idl, this.provider);
  }

  // ============================================
  // Pool Administration
  // ============================================

  /**
   * Initialize a new MASP pool
   */
  async initializePool(args: InitializePoolRequest): Promise<InitializePoolResult> {
    const authority = this.provider.publicKey;
    const { poolConfig, merkleTree, relayerRegistry, complianceConfig } = derivePoolPdas(
      authority,
      this.programId
    );

    const tx = await this.program.methods
      .initializePool(args.merkleTreeDepth, args.rootHistorySize)
      .accounts({
        authority,
        poolConfig,
        merkleTree,
        relayerRegistry,
        complianceConfig,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    return {
      signature: tx,
      poolConfig,
      merkleTree,
      relayerRegistry,
      complianceConfig,
    };
  }

  /**
   * Register a new asset (SPL token) in the pool
   */
  async registerAsset(
    poolConfig: PublicKey,
    args: RegisterAssetRequest
  ): Promise<TransactionSignature> {
    const assetId = computeAssetId(args.mint);
    const [assetVault] = findAssetVaultPda(poolConfig, assetId, this.programId);
    const vaultTokenAccount = getAssociatedTokenAddressSync(args.mint, assetVault, true);

    return await this.program.methods
      .registerAsset(Array.from(assetId))
      .accounts({
        authority: this.provider.publicKey,
        poolConfig,
        mint: args.mint,
        assetVault,
        vaultTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();
  }

  /**
   * Set verification key for a proof type
   */
  async setVerificationKey(
    poolConfig: PublicKey,
    args: SetVerificationKeyRequest
  ): Promise<TransactionSignature> {
    const [vkAccount] = findVerificationKeyPda(poolConfig, args.proofType, this.programId);

    return await this.program.methods
      .setVerificationKey(
        { [args.proofType.toLowerCase()]: {} },
        Array.from(args.vkData),
        args.icLen
      )
      .accounts({
        authority: this.provider.publicKey,
        poolConfig,
        vkAccount,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * Lock verification key (make immutable)
   */
  async lockVerificationKey(
    poolConfig: PublicKey,
    proofType: ProofType
  ): Promise<TransactionSignature> {
    const [vkAccount] = findVerificationKeyPda(poolConfig, proofType, this.programId);

    return await this.program.methods
      .lockVerificationKey({ [proofType.toLowerCase()]: {} })
      .accounts({
        authority: this.provider.publicKey,
        poolConfig,
        vkAccount,
      })
      .rpc();
  }

  /**
   * Pause the pool (emergency stop)
   */
  async pausePool(poolConfig: PublicKey): Promise<TransactionSignature> {
    return await this.program.methods
      .pausePool()
      .accounts({
        authority: this.provider.publicKey,
        poolConfig,
      })
      .rpc();
  }

  /**
   * Unpause the pool
   */
  async unpausePool(poolConfig: PublicKey): Promise<TransactionSignature> {
    return await this.program.methods
      .unpausePool()
      .accounts({
        authority: this.provider.publicKey,
        poolConfig,
      })
      .rpc();
  }

  /**
   * Initiate authority transfer (2-step process)
   */
  async initiateAuthorityTransfer(
    poolConfig: PublicKey,
    newAuthority: PublicKey
  ): Promise<TransactionSignature> {
    return await this.program.methods
      .initiateAuthorityTransfer(newAuthority)
      .accounts({
        authority: this.provider.publicKey,
        poolConfig,
      })
      .rpc();
  }

  /**
   * Accept authority transfer (called by new authority)
   */
  async acceptAuthorityTransfer(poolConfig: PublicKey): Promise<TransactionSignature> {
    return await this.program.methods
      .acceptAuthorityTransfer()
      .accounts({
        newAuthority: this.provider.publicKey,
        poolConfig,
      })
      .rpc();
  }

  /**
   * Cancel pending authority transfer
   */
  async cancelAuthorityTransfer(poolConfig: PublicKey): Promise<TransactionSignature> {
    return await this.program.methods
      .cancelAuthorityTransfer()
      .accounts({
        authority: this.provider.publicKey,
        poolConfig,
      })
      .rpc();
  }

  // ============================================
  // MASP Core Operations
  // ============================================

  /**
   * Deposit tokens into the shielded pool
   *
   * @param poolConfig - Pool configuration account
   * @param args - Deposit parameters including commitment and amount
   * @returns Deposit result with leaf index
   */
  async depositMasp(poolConfig: PublicKey, args: DepositRequest): Promise<DepositResult> {
    const pool = await this.getPoolConfig(poolConfig);
    const [merkleTree] = findMerkleTreePda(poolConfig, this.programId);
    const assetId = computeAssetId(args.mint);
    const [assetVault] = findAssetVaultPda(poolConfig, assetId, this.programId);
    const vaultTokenAccount = getAssociatedTokenAddressSync(args.mint, assetVault, true);
    const depositorTokenAccount = getAssociatedTokenAddressSync(
      args.mint,
      this.provider.publicKey
    );
    const [complianceConfig] = findComplianceConfigPda(poolConfig, this.programId);

    const tx = await this.program.methods
      .depositMasp(
        Array.from(args.commitment),
        Array.from(assetId),
        toBN(args.amount),
        args.encryptedNote ? Array.from(args.encryptedNote) : null
      )
      .accounts({
        depositor: this.provider.publicKey,
        poolConfig,
        merkleTree,
        assetVault,
        vaultTokenAccount,
        depositorTokenAccount,
        complianceConfig,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    // Get updated tree to find leaf index
    const tree = await this.getMerkleTree(merkleTree);

    return {
      signature: tx,
      leafIndex: tree.nextLeafIndex - 1,
      merkleRoot: tree.currentRoot,
    };
  }

  /**
   * Withdraw tokens from the shielded pool with ZK proof
   *
   * @param poolConfig - Pool configuration account
   * @param args - Withdrawal parameters including proof and nullifier
   * @returns Withdrawal result
   */
  async withdrawMasp(poolConfig: PublicKey, args: WithdrawRequest): Promise<WithdrawResult> {
    // Validate proof size
    if (args.proof.length !== PROOF_SIZE) {
      throw new Error(`Invalid proof size: expected ${PROOF_SIZE}, got ${args.proof.length}`);
    }

    const [merkleTree] = findMerkleTreePda(poolConfig, this.programId);
    const assetId = computeAssetId(args.mint);
    const [assetVault] = findAssetVaultPda(poolConfig, assetId, this.programId);
    const vaultTokenAccount = getAssociatedTokenAddressSync(args.mint, assetVault, true);
    const recipientTokenAccount = getAssociatedTokenAddressSync(args.mint, args.recipient);
    const [vkAccount] = findVerificationKeyPda(poolConfig, ProofType.Withdraw, this.programId);
    const [nullifierAccount] = findSpentNullifierPda(
      poolConfig,
      args.nullifierHash,
      this.programId
    );
    const [complianceConfig] = findComplianceConfigPda(poolConfig, this.programId);

    // Handle relayer accounts
    let relayerTokenAccount: PublicKey | null = null;
    if (args.relayer) {
      relayerTokenAccount = getAssociatedTokenAddressSync(args.mint, args.relayer);
    }

    const tx = await this.program.methods
      .withdrawMasp(
        Array.from(args.proof),
        Array.from(args.merkleRoot),
        Array.from(args.nullifierHash),
        Array.from(assetId),
        toBN(args.amount),
        toBN(args.relayerFee ?? 0)
      )
      .accounts({
        recipient: args.recipient,
        poolConfig,
        merkleTree,
        assetVault,
        vaultTokenAccount,
        recipientTokenAccount,
        vkAccount,
        nullifierAccount,
        relayer: args.relayer ?? null,
        relayerTokenAccount,
        complianceConfig,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return {
      signature: tx,
      nullifierHash: args.nullifierHash,
    };
  }

  /**
   * Private transfer (Join-Split) - NOT IMPLEMENTED IN V2.0
   */
  async privateTransferJoinSplit(): Promise<never> {
    throw new Error(
      'Join-Split transfers are not implemented in v2.0. This feature is reserved for v2.1.'
    );
  }

  /**
   * Prove membership in the shielded pool - NOT IMPLEMENTED IN V2.0
   */
  async proveMembership(): Promise<never> {
    throw new Error(
      'Membership proofs are not implemented in v2.0. This feature is reserved for v2.1.'
    );
  }

  /**
   * Execute shielded action via CPI - NOT IMPLEMENTED IN V2.0
   */
  async executeShieldedAction(): Promise<never> {
    throw new Error(
      'Shielded CPI actions are not implemented in v2.0. This feature is reserved for v2.1.'
    );
  }

  // ============================================
  // Relayer Registry
  // ============================================

  /**
   * Configure relayer registry parameters
   */
  async configureRelayerRegistry(
    poolConfig: PublicKey,
    args: ConfigureRelayerRegistryRequest
  ): Promise<TransactionSignature> {
    const [relayerRegistry] = findRelayerRegistryPda(poolConfig, this.programId);

    return await this.program.methods
      .configureRelayerRegistry(
        args.minFeeBps ?? null,
        args.maxFeeBps ?? null,
        args.minStake ? toBN(args.minStake) : null,
        args.registrationOpen ?? null
      )
      .accounts({
        authority: this.provider.publicKey,
        poolConfig,
        relayerRegistry,
      })
      .rpc();
  }

  /**
   * Register as a relayer
   */
  async registerRelayer(
    poolConfig: PublicKey,
    args: RegisterRelayerRequest
  ): Promise<TransactionSignature> {
    const [relayerRegistry] = findRelayerRegistryPda(poolConfig, this.programId);
    const [relayerNode] = findRelayerNodePda(
      relayerRegistry,
      this.provider.publicKey,
      this.programId
    );

    return await this.program.methods
      .registerRelayer(args.feeBps, args.metadata ?? '')
      .accounts({
        operator: this.provider.publicKey,
        poolConfig,
        relayerRegistry,
        relayerNode,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * Update relayer configuration
   */
  async updateRelayer(
    poolConfig: PublicKey,
    args: UpdateRelayerRequest
  ): Promise<TransactionSignature> {
    const [relayerRegistry] = findRelayerRegistryPda(poolConfig, this.programId);
    const [relayerNode] = findRelayerNodePda(
      relayerRegistry,
      this.provider.publicKey,
      this.programId
    );

    return await this.program.methods
      .updateRelayer(args.feeBps ?? null, args.metadata ?? null, args.active ?? null)
      .accounts({
        operator: this.provider.publicKey,
        relayerRegistry,
        relayerNode,
      })
      .rpc();
  }

  /**
   * Deactivate relayer (convenience method)
   */
  async deactivateRelayer(poolConfig: PublicKey): Promise<TransactionSignature> {
    return this.updateRelayer(poolConfig, { active: false });
  }

  /**
   * Get all registered relayers
   */
  async getRelayers(poolConfig: PublicKey): Promise<RelayerInfo[]> {
    const [relayerRegistry] = findRelayerRegistryPda(poolConfig, this.programId);

    const accounts = await this.program.account.relayerNode.all([
      {
        memcmp: {
          offset: 8, // After discriminator
          bytes: relayerRegistry.toBase58(),
        },
      },
    ]);

    return accounts.map((acc) => ({
      pubkey: acc.publicKey,
      account: acc.account as unknown as RelayerNode,
    }));
  }

  /**
   * Get active relayers only
   */
  async getActiveRelayers(poolConfig: PublicKey): Promise<RelayerInfo[]> {
    const relayers = await this.getRelayers(poolConfig);
    return relayers.filter((r) => r.account.isActive);
  }

  /**
   * Get specific relayer info
   */
  async getRelayer(poolConfig: PublicKey, operator: PublicKey): Promise<RelayerNode | null> {
    const [relayerRegistry] = findRelayerRegistryPda(poolConfig, this.programId);
    const [relayerNode] = findRelayerNodePda(relayerRegistry, operator, this.programId);

    try {
      return (await this.program.account.relayerNode.fetch(relayerNode)) as unknown as RelayerNode;
    } catch {
      return null;
    }
  }

  // ============================================
  // Compliance
  // ============================================

  /**
   * Configure compliance settings
   */
  async configureCompliance(
    poolConfig: PublicKey,
    args: ConfigureComplianceRequest
  ): Promise<TransactionSignature> {
    const [complianceConfig] = findComplianceConfigPda(poolConfig, this.programId);

    return await this.program.methods
      .configureCompliance(
        args.requireEncryptedNote ?? null,
        args.auditPubkey ? Array.from(args.auditPubkey) : null
      )
      .accounts({
        authority: this.provider.publicKey,
        poolConfig,
        complianceConfig,
      })
      .rpc();
  }

  // ============================================
  // Asset Configuration
  // ============================================

  /**
   * Configure asset settings including fixed denomination mode
   *
   * Fixed denomination pools provide stronger privacy by requiring all
   * deposits and withdrawals to use exactly the same amount, eliminating
   * amount-based correlation attacks.
   *
   * @param poolConfig - Pool configuration account
   * @param mint - Asset mint address
   * @param args - Configuration parameters
   *
   * @example
   * ```ts
   * // Enable fixed denomination of 100 USDC (6 decimals)
   * await client.configureAsset(poolConfig, usdcMint, {
   *   isFixedDenomination: true,
   *   fixedDenomination: 100_000_000, // 100 USDC
   * });
   *
   * // Disable fixed denomination (revert to flexible mode)
   * await client.configureAsset(poolConfig, usdcMint, {
   *   isFixedDenomination: false,
   * });
   * ```
   */
  async configureAsset(
    poolConfig: PublicKey,
    mint: PublicKey,
    args: ConfigureAssetRequest
  ): Promise<TransactionSignature> {
    const assetId = computeAssetId(mint);
    const [assetVault] = findAssetVaultPda(poolConfig, assetId, this.programId);

    return await this.program.methods
      .configureAsset(
        args.depositsEnabled ?? null,
        args.withdrawalsEnabled ?? null,
        args.minDeposit ? toBN(args.minDeposit) : null,
        args.maxDeposit ? toBN(args.maxDeposit) : null,
        args.isFixedDenomination ?? null,
        args.fixedDenomination ? toBN(args.fixedDenomination) : null
      )
      .accounts({
        authority: this.provider.publicKey,
        poolConfig,
        assetVault,
      })
      .rpc();
  }

  /**
   * Enable fixed denomination mode for an asset
   *
   * Convenience method for enabling fixed denomination with a specific amount.
   *
   * @param poolConfig - Pool configuration account
   * @param mint - Asset mint address
   * @param denomination - The exact amount required for all transactions
   */
  async enableFixedDenomination(
    poolConfig: PublicKey,
    mint: PublicKey,
    denomination: bigint | BN | number
  ): Promise<TransactionSignature> {
    return this.configureAsset(poolConfig, mint, {
      isFixedDenomination: true,
      fixedDenomination: toBN(denomination.toString()),
    });
  }

  /**
   * Disable fixed denomination mode for an asset
   *
   * Reverts to flexible deposit/withdrawal amounts.
   *
   * @param poolConfig - Pool configuration account
   * @param mint - Asset mint address
   */
  async disableFixedDenomination(
    poolConfig: PublicKey,
    mint: PublicKey
  ): Promise<TransactionSignature> {
    return this.configureAsset(poolConfig, mint, {
      isFixedDenomination: false,
    });
  }

  /**
   * Check if an asset uses fixed denomination mode
   *
   * @param poolConfig - Pool configuration account
   * @param mint - Asset mint address
   * @returns Object with isFixed and denomination amount
   */
  async getAssetDenominationInfo(
    poolConfig: PublicKey,
    mint: PublicKey
  ): Promise<{ isFixed: boolean; denomination: bigint }> {
    const vault = await this.getAssetVaultByMint(poolConfig, mint);
    if (!vault) {
      throw new Error('Asset not registered');
    }
    return {
      isFixed: vault.isFixedDenomination,
      denomination: BigInt(vault.fixedDenomination.toString()),
    };
  }

  /**
   * Attach audit metadata to a commitment
   */
  async attachAuditMetadata(
    poolConfig: PublicKey,
    commitment: Commitment,
    encryptedMetadata: Uint8Array
  ): Promise<TransactionSignature> {
    const [complianceConfig] = findComplianceConfigPda(poolConfig, this.programId);

    return await this.program.methods
      .attachAuditMetadata(Array.from(commitment), Array.from(encryptedMetadata))
      .accounts({
        authority: this.provider.publicKey,
        poolConfig,
        complianceConfig,
      })
      .rpc();
  }

  // ============================================
  // Account Fetchers
  // ============================================

  /**
   * Fetch pool configuration
   */
  async getPoolConfig(poolConfig: PublicKey): Promise<PoolConfigV2> {
    return (await this.program.account.poolConfigV2.fetch(poolConfig)) as unknown as PoolConfigV2;
  }

  /**
   * Fetch Merkle tree state
   */
  async getMerkleTree(merkleTree: PublicKey): Promise<MerkleTreeV2> {
    return (await this.program.account.merkleTreeV2.fetch(merkleTree)) as unknown as MerkleTreeV2;
  }

  /**
   * Fetch asset vault
   */
  async getAssetVault(assetVault: PublicKey): Promise<AssetVault> {
    return (await this.program.account.assetVault.fetch(assetVault)) as unknown as AssetVault;
  }

  /**
   * Fetch asset vault by mint
   */
  async getAssetVaultByMint(poolConfig: PublicKey, mint: PublicKey): Promise<AssetVault | null> {
    const assetId = computeAssetId(mint);
    const [assetVault] = findAssetVaultPda(poolConfig, assetId, this.programId);

    try {
      return await this.getAssetVault(assetVault);
    } catch {
      return null;
    }
  }

  /**
   * Fetch verification key
   */
  async getVerificationKey(
    poolConfig: PublicKey,
    proofType: ProofType
  ): Promise<VerificationKeyAccountV2 | null> {
    const [vkAccount] = findVerificationKeyPda(poolConfig, proofType, this.programId);

    try {
      return (await this.program.account.verificationKeyAccountV2.fetch(
        vkAccount
      )) as unknown as VerificationKeyAccountV2;
    } catch {
      return null;
    }
  }

  /**
   * Fetch relayer registry
   */
  async getRelayerRegistry(poolConfig: PublicKey): Promise<RelayerRegistry> {
    const [relayerRegistry] = findRelayerRegistryPda(poolConfig, this.programId);
    return (await this.program.account.relayerRegistry.fetch(
      relayerRegistry
    )) as unknown as RelayerRegistry;
  }

  /**
   * Fetch compliance configuration
   */
  async getComplianceConfig(poolConfig: PublicKey): Promise<ComplianceConfig> {
    const [complianceConfig] = findComplianceConfigPda(poolConfig, this.programId);
    return (await this.program.account.complianceConfig.fetch(
      complianceConfig
    )) as unknown as ComplianceConfig;
  }

  /**
   * Check if a nullifier has been spent
   */
  async isNullifierSpent(poolConfig: PublicKey, nullifierHash: NullifierHash): Promise<boolean> {
    const [nullifierAccount] = findSpentNullifierPda(poolConfig, nullifierHash, this.programId);

    try {
      await this.program.account.spentNullifierV2.fetch(nullifierAccount);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get current Merkle root
   */
  async getCurrentRoot(poolConfig: PublicKey): Promise<MerkleRoot> {
    const [merkleTree] = findMerkleTreePda(poolConfig, this.programId);
    const tree = await this.getMerkleTree(merkleTree);
    return new Uint8Array(tree.currentRoot);
  }

  /**
   * Check if a root is known (current or in history)
   */
  async isKnownRoot(poolConfig: PublicKey, root: MerkleRoot): Promise<boolean> {
    const [merkleTree] = findMerkleTreePda(poolConfig, this.programId);
    const tree = await this.getMerkleTree(merkleTree);

    // Check current root
    const rootArray = Array.from(root);
    if (JSON.stringify(tree.currentRoot) === JSON.stringify(rootArray)) {
      return true;
    }

    // Check history
    for (const historicalRoot of tree.rootHistory) {
      if (JSON.stringify(historicalRoot) === JSON.stringify(rootArray)) {
        return true;
      }
    }

    return false;
  }

  // ============================================
  // Fee Helpers
  // ============================================

  /**
   * Calculate relayer fee for an amount
   */
  calculateRelayerFee(amount: bigint | BN, feeBps: number): bigint {
    const amountBig = typeof amount === 'bigint' ? amount : BigInt(amount.toString());
    return (amountBig * BigInt(feeBps)) / BigInt(10000);
  }

  /**
   * Get fee bounds from relayer registry
   */
  async getFeeBounds(poolConfig: PublicKey): Promise<{ minFeeBps: number; maxFeeBps: number }> {
    const registry = await this.getRelayerRegistry(poolConfig);
    return {
      minFeeBps: registry.minFeeBps,
      maxFeeBps: registry.maxFeeBps,
    };
  }
}

/**
 * Create a new PsolV2Client instance
 */
export function createClient(options: PsolV2ClientOptions): PsolV2Client {
  return new PsolV2Client(options);
}
