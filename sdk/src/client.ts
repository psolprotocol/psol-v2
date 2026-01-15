/**
 * pSOL v2 SDK Client
 * 
 * Simplified client for interacting with the pSOL v2 MASP protocol
 */

import { AnchorProvider, Program, BN } from '@coral-xyz/anchor';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionSignature,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import {
  ProofType,
  toBN,
} from './types';
import {
  findPoolConfigPda,
  findMerkleTreePda,
  findAssetVaultPda,
  findVerificationKeyPda,
  findSpentNullifierPda,
  findRelayerRegistryPda,
  findComplianceConfigPda,
  findPendingBufferPda,
  computeAssetId,
  PROGRAM_ID,
} from './pda';

/** Default program ID */


/**
 * Options for creating a PsolV2Client
 */
export interface PsolV2ClientOptions {
  provider?: AnchorProvider;
  connection?: Connection;
  wallet?: Keypair;
  programId?: PublicKey;
  idl?: any;
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

    if (!options.idl) {
      throw new Error('IDL must be provided');
    }

    this.program = new Program(options.idl, this.provider);
  }

  /**
   * Get authority public key
   */
  get authority(): PublicKey {
    return this.provider.publicKey;
  }

  // ============================================
  // Pool Administration
  // ============================================

  /**
   * Initialize a new MASP pool
   */
  async initializePool(treeDepth: number, rootHistorySize: number): Promise<{
    signature: TransactionSignature;
    poolConfig: PublicKey;
    merkleTree: PublicKey;
  }> {
    const authority = this.authority;

    const [poolConfig] = findPoolConfigPda(this.programId, authority);
    const [merkleTree] = findMerkleTreePda(this.programId, poolConfig);

    const tx = await (this.program.methods as any)
      .initializePoolV2(treeDepth, rootHistorySize)
      .accounts({
        authority,
        poolConfig,
        merkleTree,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return {
      signature: tx,
      poolConfig,
      merkleTree,
    };
  }

  /**
   * Initialize pool registries (relayer registry, compliance config)
   */
  async initializePoolRegistries(poolConfig: PublicKey): Promise<TransactionSignature> {
    const authority = this.authority;

    const [relayerRegistry] = findRelayerRegistryPda(this.programId, poolConfig);
    const [complianceConfig] = findComplianceConfigPda(this.programId, poolConfig);

    return await (this.program.methods as any)
      .initializePoolRegistries()
      .accounts({
        authority,
        poolConfig,
        relayerRegistry,
        complianceConfig,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * Register an asset (SPL token) in the pool
   */
  async registerAsset(
    poolConfig: PublicKey,
    mint: PublicKey
  ): Promise<TransactionSignature> {
    const authority = this.authority;
    const assetId = computeAssetId(mint);

    const [assetVault] = findAssetVaultPda(this.programId, poolConfig, assetId);
    
    // Vault token account PDA
    const [vaultTokenAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault_token'), assetVault.toBuffer()],
      this.programId
    );

    return await (this.program.methods as any)
      .registerAsset(Array.from(assetId))
      .accounts({
        authority,
        poolConfig,
        mint,
        assetVault,
        vaultTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * Set verification key for a proof type
   */
  async setVerificationKey(
    poolConfig: PublicKey,
    proofType: ProofType,
    vkAlphaG1: Uint8Array,
    vkBetaG2: Uint8Array,
    vkGammaG2: Uint8Array,
    vkDeltaG2: Uint8Array,
    vkIc: Uint8Array[]
  ): Promise<TransactionSignature> {
    const authority = this.authority;

    const [vkAccount] = findVerificationKeyPda(this.programId, poolConfig, proofType);

    return await (this.program.methods as any)
      .setVerificationKeyV2(
        proofType,
        Array.from(vkAlphaG1),
        Array.from(vkBetaG2),
        Array.from(vkGammaG2),
        Array.from(vkDeltaG2),
        vkIc.map((ic) => Array.from(ic))
      )
      .accounts({
        authority,
        poolConfig,
        vkAccount,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  // ============================================
  // Deposits & Withdrawals
  // ============================================

  /**
   * Deposit funds into the shielded pool
   */
  async deposit(
    poolConfig: PublicKey,
    mint: PublicKey,
    amount: bigint | BN,
    commitment: Uint8Array,
    proofData: Uint8Array,
    encryptedNote?: Uint8Array | null
  ): Promise<{ signature: TransactionSignature; leafIndex: number }> {
    const depositor = this.authority;
    const assetId = computeAssetId(mint);
    const [merkleTree] = findMerkleTreePda(this.programId, poolConfig);
    const [assetVault] = findAssetVaultPda(this.programId, poolConfig, assetId);
    const [vaultTokenAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault_token'), assetVault.toBuffer()],
      this.programId
    );
    const [depositVk] = findVerificationKeyPda(this.programId, poolConfig, ProofType.Deposit);
    const userTokenAccount = getAssociatedTokenAddressSync(mint, depositor);
    
    // Fetch pool config to get authority
    const poolConfigData = await (this.program.account as any).poolConfigV2.fetch(poolConfig);
    const poolAuthority = poolConfigData.authority as PublicKey;
    
    // Check if user token account exists, create if needed
    const connection = this.provider.connection;
    const userTokenAccountInfo = await connection.getAccountInfo(userTokenAccount);
    const preInstructions: any[] = [];
    
    if (!userTokenAccountInfo) {
      const { createAssociatedTokenAccountInstruction, NATIVE_MINT: NM } = await import('@solana/spl-token');
      const createAtaIx = createAssociatedTokenAccountInstruction(
        depositor,
        userTokenAccount,
        depositor,
        mint
      );
      preInstructions.push(createAtaIx);
    }
    
    // For native SOL, fund and sync
    const { NATIVE_MINT: NM, createSyncNativeInstruction } = await import('@solana/spl-token');
    if (mint.equals(NM)) {
      const transferIx = SystemProgram.transfer({
        fromPubkey: depositor,
        toPubkey: userTokenAccount,
        lamports: Number(amount),
      });
      preInstructions.push(transferIx);
      
      const syncIx = createSyncNativeInstruction(userTokenAccount);
      preInstructions.push(syncIx);
    }
    
    const tx = await (this.program.methods as any)
      .depositMasp(
        toBN(amount),
        Array.from(commitment),
        Array.from(assetId),
        Buffer.from(proofData),
        encryptedNote || null
      )
      .accounts({
        depositor,
        poolConfig,
        authority: poolAuthority,
        merkleTree,
        assetVault,
        vaultTokenAccount,
        userTokenAccount,
        mint,
        depositVk,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .preInstructions(preInstructions)
      .rpc();

    return {
      signature: tx,
      leafIndex: 0, // TODO: Parse from logs
    };
  }
  async withdraw(
    poolConfig: PublicKey,
    mint: PublicKey,
    recipient: PublicKey,
    amount: bigint | BN,
    merkleRoot: Uint8Array,
    nullifierHash: Uint8Array,
    proofData: Uint8Array,
    relayerFee?: bigint | BN
  ): Promise<{ signature: TransactionSignature }> {
    const relayer = this.authority;
    const assetId = computeAssetId(mint);

    const [merkleTree] = findMerkleTreePda(this.programId, poolConfig);
    const [assetVault] = findAssetVaultPda(this.programId, poolConfig, assetId);
    const [vaultTokenAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault_token'), assetVault.toBuffer()],
      this.programId
    );
    const [withdrawVk] = findVerificationKeyPda(this.programId, poolConfig, ProofType.Withdraw);
    const [spentNullifier] = findSpentNullifierPda(this.programId, poolConfig, nullifierHash);
    const [relayerRegistry] = findRelayerRegistryPda(this.programId, poolConfig);

    const recipientTokenAccount = getAssociatedTokenAddressSync(mint, recipient);
    const relayerTokenAccount = getAssociatedTokenAddressSync(mint, relayer);

    // Check if recipient token account exists, create if needed
    const connection = this.provider.connection;
    const recipientAccountInfo = await connection.getAccountInfo(recipientTokenAccount);
    const preInstructions: any[] = [];
    
    if (!recipientAccountInfo) {
      const { createAssociatedTokenAccountInstruction } = await import("@solana/spl-token");
      const createAtaIx = createAssociatedTokenAccountInstruction(
        relayer,
        recipientTokenAccount,
        recipient,
        mint
      );
      preInstructions.push(createAtaIx);
    }

    // Check if relayer token account exists, create if needed
    const relayerAccountInfo = await connection.getAccountInfo(relayerTokenAccount);
    if (!relayerAccountInfo) {
      const { createAssociatedTokenAccountInstruction } = await import("@solana/spl-token");
      const createRelayerAtaIx = createAssociatedTokenAccountInstruction(
        relayer,
        relayerTokenAccount,
        relayer,
        mint
      );
      preInstructions.push(createRelayerAtaIx);
    }

    const tx = await (this.program.methods as any)
      .withdrawMasp(
        Buffer.from(proofData),
        Array.from(merkleRoot),
        Array.from(nullifierHash),
        recipient,
        toBN(amount),
        Array.from(assetId),
        toBN(relayerFee ?? 0n)
      )
      .accounts({
        relayer,
        poolConfig,
        merkleTree,
        vkAccount: withdrawVk,
        assetVault,
        vaultTokenAccount,
        recipientTokenAccount,
        relayerTokenAccount,
        spentNullifier,
        relayerRegistry,
        relayerNode: null,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .preInstructions(preInstructions)
      .rpc();

    return { signature: tx };
  }

  /**
   * Withdraw V2 (join-split with change)
   * Enables partial withdrawals with a change output
   * 
   * @param poolConfig - Pool configuration account
   * @param mint - Token mint address
   * @param recipient - Recipient address for withdrawn funds
   * @param amount - Gross withdrawal amount (includes relayer fee)
   * @param merkleRoot - Merkle root for proof verification
   * @param nullifierHash0 - Primary nullifier hash
   * @param nullifierHash1 - Secondary nullifier hash (pass zeros if unused)
   * @param changeCommitment - Change output commitment
   * @param proofData - ZK proof bytes (256 bytes)
   * @param relayerFee - Fee for relayer service
   */
  async withdrawV2(
    poolConfig: PublicKey,
    mint: PublicKey,
    recipient: PublicKey,
    amount: bigint | BN,
    merkleRoot: Uint8Array,
    nullifierHash0: Uint8Array,
    nullifierHash1: Uint8Array,
    changeCommitment: Uint8Array,
    proofData: Uint8Array,
    relayerFee?: bigint | BN
  ): Promise<{ signature: TransactionSignature }> {
    const relayer = this.authority;
    const assetId = computeAssetId(mint);

    // Derive all required PDAs
    const [merkleTree] = findMerkleTreePda(this.programId, poolConfig);
    const [assetVault] = findAssetVaultPda(this.programId, poolConfig, assetId);
    const [vaultTokenAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault_token'), assetVault.toBuffer()],
      this.programId
    );
    const [withdrawV2Vk] = findVerificationKeyPda(this.programId, poolConfig, ProofType.WithdrawV2);
    const [spentNullifier0] = findSpentNullifierPda(this.programId, poolConfig, nullifierHash0);
    const [relayerRegistry] = findRelayerRegistryPda(this.programId, poolConfig);
    const [pendingBuffer] = findPendingBufferPda(this.programId, poolConfig);

    // Check if second nullifier is used (not all zeros)
    const hasSecondNullifier = !nullifierHash1.every(byte => byte === 0);
    const spentNullifier1 = hasSecondNullifier 
      ? findSpentNullifierPda(this.programId, poolConfig, nullifierHash1)[0]
      : null;

    const recipientTokenAccount = getAssociatedTokenAddressSync(mint, recipient);
    const relayerTokenAccount = getAssociatedTokenAddressSync(mint, relayer);

    // Check if recipient token account exists, create if needed
    const connection = this.provider.connection;
    const recipientAccountInfo = await connection.getAccountInfo(recipientTokenAccount);
    const preInstructions: any[] = [];
    
    if (!recipientAccountInfo) {
      const { createAssociatedTokenAccountInstruction } = await import("@solana/spl-token");
      const createAtaIx = createAssociatedTokenAccountInstruction(
        relayer,
        recipientTokenAccount,
        recipient,
        mint
      );
      preInstructions.push(createAtaIx);
    }

    // Check if relayer token account exists, create if needed
    const relayerAccountInfo = await connection.getAccountInfo(relayerTokenAccount);
    if (!relayerAccountInfo) {
      const { createAssociatedTokenAccountInstruction } = await import("@solana/spl-token");
      const createRelayerAtaIx = createAssociatedTokenAccountInstruction(
        relayer,
        relayerTokenAccount,
        relayer,
        mint
      );
      preInstructions.push(createRelayerAtaIx);
    }

    const tx = await (this.program.methods as any)
      .withdrawV2(
        Buffer.from(proofData),
        Array.from(merkleRoot),
        Array.from(assetId),
        Array.from(nullifierHash0),
        Array.from(nullifierHash1),
        Array.from(changeCommitment),
        recipient,
        toBN(amount),
        toBN(relayerFee ?? 0n)
      )
      .accounts({
        relayer,
        poolConfig,
        merkleTree,
        vkAccount: withdrawV2Vk,
        assetVault,
        vaultTokenAccount,
        recipientTokenAccount,
        relayerTokenAccount,
        spentNullifier0,
        spentNullifier1,
        pendingBuffer,
        relayerRegistry,
        relayerNode: null,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .preInstructions(preInstructions)
      .rpc();

    return { signature: tx };
  }

  // ============================================
  // Account Fetchers
  // ============================================

  /**
   * Fetch pool configuration
   */
  async fetchPoolConfig(poolConfig: PublicKey): Promise<any> {
    return await (this.program.account as any).poolConfigV2.fetch(poolConfig);
  }

  /**
   * Fetch Merkle tree state
   */
  async fetchMerkleTree(merkleTree: PublicKey): Promise<any> {
    return await (this.program.account as any).merkleTreeV2.fetch(merkleTree);
  }

  /**
   * Fetch asset vault
   */
  async fetchAssetVault(assetVault: PublicKey): Promise<any> {
    return await (this.program.account as any).assetVault.fetch(assetVault);
  }

  /**
   * Check if nullifier has been spent
   */
  async isNullifierSpent(poolConfig: PublicKey, nullifierHash: Uint8Array): Promise<boolean> {
    const [spentNullifier] = findSpentNullifierPda(this.programId, poolConfig, nullifierHash);
    try {
      await (this.program.account as any).spentNullifierV2.fetch(spentNullifier);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create a PsolV2Client from IDL JSON
 */
export function createPsolClient(
  provider: AnchorProvider,
  idl: any,
  programId?: PublicKey
): PsolV2Client {
  return new PsolV2Client({
    provider,
    idl,
    programId,
  });
}
