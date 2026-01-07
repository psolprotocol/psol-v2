"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/crypto/poseidon.ts
var poseidon_exports = {};
__export(poseidon_exports, {
  FIELD_MODULUS: () => FIELD_MODULUS,
  Poseidon: () => import_circomlibjs.Poseidon,
  bigIntToBytes: () => bigIntToBytes,
  bigIntToFieldBytes: () => bigIntToFieldBytes,
  bytesToBigInt: () => bytesToBigInt,
  computeCommitment: () => computeCommitment,
  computeNullifierHash: () => computeNullifierHash,
  fieldMod: () => fieldMod,
  hashFour: () => hashFour,
  hashTwo: () => hashTwo,
  initPoseidon: () => initPoseidon,
  isValidFieldElement: () => isValidFieldElement,
  randomFieldElement: () => randomFieldElement
});
async function initPoseidon() {
  if (!poseidonInstance) {
    poseidonInstance = await (0, import_circomlibjs.buildPoseidon)();
  }
}
function getPoseidon() {
  if (!poseidonInstance) {
    throw new Error("Poseidon not initialized. Call initPoseidon() first.");
  }
  return poseidonInstance;
}
function hashTwo(left, right) {
  const poseidon = getPoseidon();
  const hash = poseidon([left, right]);
  return poseidon.F.toObject(hash);
}
function hashFour(a, b, c, d) {
  const poseidon = getPoseidon();
  const hash = poseidon([a, b, c, d]);
  return poseidon.F.toObject(hash);
}
function computeCommitment(secret, nullifier, amount, assetId) {
  return hashFour(secret, nullifier, amount, assetId);
}
function computeNullifierHash(nullifier, secret, leafIndex) {
  const inner = hashTwo(nullifier, secret);
  return hashTwo(inner, leafIndex);
}
function bytesToBigInt(bytes) {
  let result = BigInt(0);
  for (let i = 0; i < bytes.length; i++) {
    result = result << BigInt(8) | BigInt(bytes[i]);
  }
  return result;
}
function bigIntToBytes(value) {
  const bytes = new Uint8Array(32);
  let temp = value;
  for (let i = 31; i >= 0; i--) {
    bytes[i] = Number(temp & BigInt(255));
    temp = temp >> BigInt(8);
  }
  return bytes;
}
function bigIntToFieldBytes(value) {
  const bytes = new Uint8Array(32);
  let temp = value;
  for (let i = 0; i < 32; i++) {
    bytes[i] = Number(temp & BigInt(255));
    temp = temp >> BigInt(8);
  }
  return bytes;
}
function randomFieldElement() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  bytes[0] &= 31;
  return bytesToBigInt(bytes);
}
function isValidFieldElement(value) {
  return value >= BigInt(0) && value < FIELD_MODULUS;
}
function fieldMod(value) {
  return (value % FIELD_MODULUS + FIELD_MODULUS) % FIELD_MODULUS;
}
var import_circomlibjs, poseidonInstance, FIELD_MODULUS;
var init_poseidon = __esm({
  "src/crypto/poseidon.ts"() {
    "use strict";
    import_circomlibjs = require("circomlibjs");
    poseidonInstance = null;
    FIELD_MODULUS = BigInt(
      "21888242871839275222246405745257275088548364400416034343698204186575808495617"
    );
  }
});

// src/index.ts
var index_exports = {};
__export(index_exports, {
  AssetType: () => AssetType,
  COMPLIANCE_SEED: () => COMPLIANCE_SEED,
  DEFAULT_CIRCUIT_PATHS: () => DEFAULT_CIRCUIT_PATHS,
  DEFAULT_ROOT_HISTORY_SIZE: () => DEFAULT_ROOT_HISTORY_SIZE,
  FEATURE_COMPLIANCE: () => FEATURE_COMPLIANCE,
  FEATURE_JOIN_SPLIT: () => FEATURE_JOIN_SPLIT,
  FEATURE_MASP: () => FEATURE_MASP,
  FEATURE_MEMBERSHIP: () => FEATURE_MEMBERSHIP,
  FEATURE_SHIELDED_CPI: () => FEATURE_SHIELDED_CPI,
  FIELD_MODULUS: () => FIELD_MODULUS,
  G1_POINT_SIZE: () => G1_POINT_SIZE,
  G2_POINT_SIZE: () => G2_POINT_SIZE,
  IS_PRODUCTION_READY: () => IS_PRODUCTION_READY,
  MAX_ENCRYPTED_NOTE_SIZE: () => MAX_ENCRYPTED_NOTE_SIZE,
  MAX_METADATA_URI_LEN: () => MAX_METADATA_URI_LEN,
  MAX_TREE_DEPTH: () => MAX_TREE_DEPTH,
  MERKLE_TREE_V2_SEED: () => MERKLE_TREE_V2_SEED,
  MIN_ROOT_HISTORY_SIZE: () => MIN_ROOT_HISTORY_SIZE,
  MIN_TREE_DEPTH: () => MIN_TREE_DEPTH,
  MerkleTree: () => MerkleTree,
  NATIVE_SOL_ASSET_ID: () => NATIVE_SOL_ASSET_ID,
  NULLIFIER_V2_SEED: () => NULLIFIER_V2_SEED,
  NoteStore: () => NoteStore,
  POOL_V2_SEED: () => POOL_V2_SEED,
  PROGRAM_ID: () => PROGRAM_ID,
  PROOF_SIZE: () => PROOF_SIZE,
  Poseidon: () => import_circomlibjs.Poseidon,
  ProofType: () => ProofType2,
  Prover: () => Prover,
  PsolV2Client: () => PsolV2Client,
  RELAYER_REGISTRY_SEED: () => RELAYER_REGISTRY_SEED,
  RELAYER_SEED: () => RELAYER_SEED,
  SDK_STATUS: () => SDK_STATUS,
  SDK_VERSION: () => SDK_VERSION,
  ShieldedActionType: () => ShieldedActionType,
  SpendType: () => SpendType,
  VAULT_V2_SEED: () => VAULT_V2_SEED,
  bigIntToBytes: () => bigIntToBytes,
  bigIntToFieldBytes: () => bigIntToFieldBytes,
  bytesEqual: () => bytesEqual,
  bytesToBigInt: () => bytesToBigInt,
  bytesToCommitment: () => bytesToCommitment,
  commitmentToBytes: () => commitmentToBytes,
  computeAssetId: () => computeAssetId,
  computeAssetIdKeccak: () => computeAssetIdKeccak,
  computeCommitment: () => computeCommitment,
  computeNoteNullifier: () => computeNoteNullifier,
  computeNullifierHash: () => computeNullifierHash,
  createNote: () => createNote,
  createNoteFromParams: () => createNoteFromParams,
  createPsolClient: () => createPsolClient,
  decryptNote: () => decryptNote,
  deriveAssetVaultPdas: () => deriveAssetVaultPdas,
  derivePoolPdas: () => derivePoolPdas,
  deriveVerificationKeyPdas: () => deriveVerificationKeyPdas,
  deserializeNote: () => deserializeNote,
  encryptNote: () => encryptNote,
  exportVerificationKey: () => exportVerificationKey,
  fieldMod: () => fieldMod,
  findAssetVaultPda: () => findAssetVaultPda,
  findComplianceConfigPda: () => findComplianceConfigPda,
  findMerkleTreePda: () => findMerkleTreePda,
  findPoolConfigPda: () => findPoolConfigPda,
  findRelayerNodePda: () => findRelayerNodePda,
  findRelayerRegistryPda: () => findRelayerRegistryPda,
  findSpentNullifierPda: () => findSpentNullifierPda,
  findVerificationKeyPda: () => findVerificationKeyPda,
  fromHex: () => fromHex,
  hashFour: () => hashFour,
  hashTwo: () => hashTwo,
  initPoseidon: () => initPoseidon,
  initializeSDK: () => initializeSDK,
  isValidCommitment: () => isValidCommitment,
  isValidFieldElement: () => isValidFieldElement,
  isValidNullifier: () => isValidNullifier,
  isValidProofLength: () => isValidProofLength,
  proofTypeSeed: () => proofTypeSeed,
  pubkeyToScalar: () => pubkeyToScalar,
  randomFieldElement: () => randomFieldElement,
  serializeNote: () => serializeNote,
  syncTreeWithChain: () => syncTreeWithChain,
  toBN: () => toBN,
  toHex: () => toHex,
  verifyProofLocally: () => verifyProofLocally
});
module.exports = __toCommonJS(index_exports);
init_poseidon();

// src/note/note.ts
init_poseidon();
async function createNote(amount, assetId) {
  await initPoseidon();
  const secret = randomFieldElement();
  const nullifier = randomFieldElement();
  const commitment = computeCommitment(secret, nullifier, amount, assetId);
  return {
    secret,
    nullifier,
    amount,
    assetId,
    commitment
  };
}
async function createNoteFromParams(secret, nullifier, amount, assetId, leafIndex, merkleRoot) {
  await initPoseidon();
  const commitment = computeCommitment(secret, nullifier, amount, assetId);
  return {
    secret,
    nullifier,
    amount,
    assetId,
    commitment,
    leafIndex,
    merkleRoot
  };
}
async function computeNoteNullifier(note) {
  if (note.leafIndex === void 0) {
    throw new Error("Note must have leafIndex set to compute nullifier hash");
  }
  await initPoseidon();
  const nullifierHash = computeNullifierHash(
    note.nullifier,
    note.secret,
    BigInt(note.leafIndex)
  );
  return {
    ...note,
    nullifierHash
  };
}
function serializeNote(note) {
  return {
    secret: note.secret.toString(),
    nullifier: note.nullifier.toString(),
    amount: note.amount.toString(),
    assetId: note.assetId.toString(),
    commitment: note.commitment.toString(),
    leafIndex: note.leafIndex,
    merkleRoot: note.merkleRoot?.toString(),
    depositTimestamp: note.depositTimestamp,
    depositSignature: note.depositSignature
  };
}
function deserializeNote(data) {
  return {
    secret: BigInt(data.secret),
    nullifier: BigInt(data.nullifier),
    amount: BigInt(data.amount),
    assetId: BigInt(data.assetId),
    commitment: BigInt(data.commitment),
    leafIndex: data.leafIndex,
    merkleRoot: data.merkleRoot ? BigInt(data.merkleRoot) : void 0,
    depositTimestamp: data.depositTimestamp,
    depositSignature: data.depositSignature
  };
}
function commitmentToBytes(commitment) {
  return bigIntToBytes(commitment);
}
function bytesToCommitment(bytes) {
  return bytesToBigInt(bytes);
}
async function encryptNote(note, password) {
  const serialized = JSON.stringify(serializeNote(note));
  const encoder = new TextEncoder();
  const data = encoder.encode(serialized);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 1e5,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );
  const result = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  result.set(salt, 0);
  result.set(iv, salt.length);
  result.set(new Uint8Array(encrypted), salt.length + iv.length);
  return result;
}
async function decryptNote(encryptedData, password) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const salt = encryptedData.slice(0, 16);
  const iv = encryptedData.slice(16, 28);
  const ciphertext = encryptedData.slice(28);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 1e5,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  const serialized = decoder.decode(decrypted);
  return deserializeNote(JSON.parse(serialized));
}
var NoteStore = class _NoteStore {
  constructor() {
    this.notes = /* @__PURE__ */ new Map();
  }
  /**
   * Add a note to the store
   */
  add(note) {
    const key = note.commitment.toString();
    this.notes.set(key, note);
  }
  /**
   * Get a note by commitment
   */
  get(commitment) {
    return this.notes.get(commitment.toString());
  }
  /**
   * Get all unspent notes for an asset
   */
  getByAsset(assetId) {
    return Array.from(this.notes.values()).filter(
      (note) => note.assetId === assetId
    );
  }
  /**
   * Get total balance for an asset
   */
  getBalance(assetId) {
    return this.getByAsset(assetId).reduce(
      (sum, note) => sum + note.amount,
      BigInt(0)
    );
  }
  /**
   * Remove a note (after spending)
   */
  remove(commitment) {
    return this.notes.delete(commitment.toString());
  }
  /**
   * Get all notes
   */
  getAll() {
    return Array.from(this.notes.values());
  }
  /**
   * Serialize store to JSON
   */
  serialize() {
    const notes = Array.from(this.notes.values()).map(serializeNote);
    return JSON.stringify(notes);
  }
  /**
   * Load store from JSON
   */
  static deserialize(data) {
    const store = new _NoteStore();
    const notes = JSON.parse(data);
    for (const serialized of notes) {
      store.add(deserializeNote(serialized));
    }
    return store;
  }
};

// src/merkle/tree.ts
init_poseidon();
function computeZeros(depth) {
  const zeros = new Array(depth + 1);
  zeros[0] = BigInt(0);
  for (let i = 1; i <= depth; i++) {
    zeros[i] = hashTwo(zeros[i - 1], zeros[i - 1]);
  }
  return zeros;
}
var MerkleTree = class _MerkleTree {
  constructor(depth) {
    /** Current number of leaves */
    this.nextIndex = 0;
    /** All leaves (for proof generation) */
    this.leaves = [];
    /** Root history */
    this.rootHistory = [];
    if (depth < 4 || depth > 24) {
      throw new Error("Tree depth must be between 4 and 24");
    }
    this.depth = depth;
    this.maxLeaves = 2 ** depth;
    this.zeros = computeZeros(depth);
    this.filledSubtrees = [...this.zeros.slice(0, depth)];
    this._root = this.zeros[depth];
  }
  /**
   * Initialize Poseidon (must be called before using tree)
   */
  static async create(depth) {
    await initPoseidon();
    return new _MerkleTree(depth);
  }
  /**
   * Get current root
   */
  get root() {
    return this._root;
  }
  /**
   * Get next available leaf index
   */
  get nextLeafIndex() {
    return this.nextIndex;
  }
  /**
   * Check if tree is full
   */
  get isFull() {
    return this.nextIndex >= this.maxLeaves;
  }
  /**
   * Insert a leaf and return its index
   */
  insert(leaf) {
    if (this.isFull) {
      throw new Error("Merkle tree is full");
    }
    const leafIndex = this.nextIndex;
    this.leaves.push(leaf);
    let currentHash = leaf;
    let currentIndex = leafIndex;
    for (let level = 0; level < this.depth; level++) {
      if (currentIndex % 2 === 0) {
        this.filledSubtrees[level] = currentHash;
        currentHash = hashTwo(currentHash, this.zeros[level]);
      } else {
        currentHash = hashTwo(this.filledSubtrees[level], currentHash);
      }
      currentIndex = Math.floor(currentIndex / 2);
    }
    this.rootHistory.push(this._root);
    this._root = currentHash;
    this.nextIndex++;
    return leafIndex;
  }
  /**
   * Generate Merkle proof for a leaf
   */
  generateProof(leafIndex) {
    if (leafIndex < 0 || leafIndex >= this.nextIndex) {
      throw new Error(`Invalid leaf index: ${leafIndex}`);
    }
    const pathElements = [];
    const pathIndices = [];
    const levels = [this.leaves.slice()];
    const paddedLeaves = [...this.leaves];
    while (paddedLeaves.length < Math.pow(2, Math.ceil(Math.log2(this.nextIndex)))) {
      paddedLeaves.push(BigInt(0));
    }
    levels[0] = paddedLeaves;
    for (let level = 0; level < this.depth; level++) {
      const currentLevel = levels[level];
      const nextLevel = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : this.zeros[level];
        nextLevel.push(hashTwo(left, right));
      }
      if (nextLevel.length === 0) {
        nextLevel.push(this.zeros[level + 1]);
      }
      levels.push(nextLevel);
    }
    let currentIndex = leafIndex;
    for (let level = 0; level < this.depth; level++) {
      const siblingIndex = currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;
      const sibling = siblingIndex < levels[level].length ? levels[level][siblingIndex] : this.zeros[level];
      pathElements.push(sibling);
      pathIndices.push(currentIndex % 2);
      currentIndex = Math.floor(currentIndex / 2);
    }
    return {
      pathElements,
      pathIndices,
      leaf: this.leaves[leafIndex],
      root: this._root,
      leafIndex
    };
  }
  /**
   * Verify a Merkle proof
   */
  static verifyProof(proof) {
    let currentHash = proof.leaf;
    for (let i = 0; i < proof.pathElements.length; i++) {
      if (proof.pathIndices[i] === 0) {
        currentHash = hashTwo(currentHash, proof.pathElements[i]);
      } else {
        currentHash = hashTwo(proof.pathElements[i], currentHash);
      }
    }
    return currentHash === proof.root;
  }
  /**
   * Check if a root is known (current or historical)
   */
  isKnownRoot(root) {
    if (root === this._root) return true;
    return this.rootHistory.includes(root);
  }
  /**
   * Get root at a specific leaf index
   */
  getRootAtIndex(leafIndex) {
    if (leafIndex < 0 || leafIndex >= this.nextIndex) {
      return void 0;
    }
    if (leafIndex === this.nextIndex - 1) {
      return this._root;
    }
    return this.rootHistory[leafIndex];
  }
  /**
   * Serialize tree state
   */
  serialize() {
    return JSON.stringify({
      depth: this.depth,
      nextIndex: this.nextIndex,
      leaves: this.leaves.map((l) => l.toString()),
      rootHistory: this.rootHistory.map((r) => r.toString()),
      root: this._root.toString()
    });
  }
  /**
   * Deserialize tree state
   */
  static async deserialize(data) {
    await initPoseidon();
    const parsed = JSON.parse(data);
    const tree = new _MerkleTree(parsed.depth);
    tree.nextIndex = parsed.nextIndex;
    tree.leaves = parsed.leaves.map((l) => BigInt(l));
    tree.rootHistory = parsed.rootHistory.map((r) => BigInt(r));
    tree._root = BigInt(parsed.root);
    for (const leaf of tree.leaves) {
    }
    return tree;
  }
};
async function syncTreeWithChain(tree, onChainLeaves) {
  for (let i = tree.nextLeafIndex; i < onChainLeaves.length; i++) {
    tree.insert(onChainLeaves[i]);
  }
}

// src/proof/prover.ts
var snarkjs = __toESM(require("snarkjs"));
var ProofType = /* @__PURE__ */ ((ProofType3) => {
  ProofType3[ProofType3["Deposit"] = 0] = "Deposit";
  ProofType3[ProofType3["Withdraw"] = 1] = "Withdraw";
  ProofType3[ProofType3["JoinSplit"] = 2] = "JoinSplit";
  ProofType3[ProofType3["Membership"] = 3] = "Membership";
  return ProofType3;
})(ProofType || {});
var DEFAULT_MERKLE_TREE_DEPTH = 20;
var DEFAULT_CIRCUIT_PATHS = {
  [0 /* Deposit */]: {
    wasmPath: "circuits/build/deposit_js/deposit.wasm",
    zkeyPath: "circuits/build/deposit.zkey"
  },
  [1 /* Withdraw */]: {
    wasmPath: "circuits/build/withdraw_js/withdraw.wasm",
    zkeyPath: "circuits/build/withdraw.zkey"
  },
  [2 /* JoinSplit */]: {
    wasmPath: "circuits/build/joinsplit_js/joinsplit.wasm",
    zkeyPath: "circuits/build/joinsplit.zkey"
  },
  [3 /* Membership */]: {
    wasmPath: "circuits/build/membership_js/membership.wasm",
    zkeyPath: "circuits/build/membership.zkey"
  }
};
var Prover = class {
  constructor(circuitPaths, merkleTreeDepth = DEFAULT_MERKLE_TREE_DEPTH) {
    this.circuitPaths = {
      ...DEFAULT_CIRCUIT_PATHS,
      ...circuitPaths
    };
    this.merkleTreeDepth = merkleTreeDepth;
  }
  /**
   * Generate deposit proof
   */
  async generateDepositProof(inputs) {
    this.assertCircuitArtifactsExist(0 /* Deposit */);
    const circuitInputs = {
      commitment: inputs.commitment.toString(),
      amount: inputs.amount.toString(),
      asset_id: inputs.assetId.toString(),
      secret: inputs.secret.toString(),
      nullifier: inputs.nullifier.toString()
    };
    const paths = this.circuitPaths[0 /* Deposit */];
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      circuitInputs,
      paths.wasmPath,
      paths.zkeyPath
    );
    return this.serializeProof(proof, publicSignals);
  }
  /**
   * Generate withdrawal proof
   */
  async generateWithdrawProof(inputs) {
    this.assertCircuitArtifactsExist(1 /* Withdraw */);
    this.assertMerkleDepth(inputs.merkleProof.pathElements.length, "withdraw");
    const circuitInputs = {
      // Public inputs
      merkle_root: inputs.merkleRoot.toString(),
      nullifier_hash: inputs.nullifierHash.toString(),
      asset_id: inputs.assetId.toString(),
      recipient: pubkeyToScalar(inputs.recipient).toString(),
      amount: inputs.amount.toString(),
      relayer: pubkeyToScalar(inputs.relayer).toString(),
      relayer_fee: inputs.relayerFee.toString(),
      public_data_hash: inputs.publicDataHash.toString(),
      // Private inputs
      secret: inputs.secret.toString(),
      nullifier: inputs.nullifier.toString(),
      leaf_index: inputs.leafIndex.toString(),
      merkle_path: inputs.merkleProof.pathElements.map((e) => e.toString()),
      merkle_path_indices: inputs.merkleProof.pathIndices.map((i) => i.toString())
    };
    const paths = this.circuitPaths[1 /* Withdraw */];
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      circuitInputs,
      paths.wasmPath,
      paths.zkeyPath
    );
    return this.serializeProof(proof, publicSignals);
  }
  /**
   * Generate JoinSplit proof
   */
  async generateJoinSplitProof(inputs) {
    this.assertCircuitArtifactsExist(2 /* JoinSplit */);
    if (inputs.inputNotes.length !== 2 || inputs.outputNotes.length !== 2) {
      throw new Error("JoinSplit requires exactly 2 inputs and 2 outputs");
    }
    for (const proof2 of inputs.inputMerkleProofs) {
      this.assertMerkleDepth(proof2.pathElements.length, "joinsplit");
    }
    const circuitInputs = {
      merkle_root: inputs.merkleRoot.toString(),
      asset_id: inputs.assetId.toString(),
      input_nullifiers: inputs.inputNotes.map((n) => n.nullifierHash.toString()),
      output_commitments: inputs.outputNotes.map((n) => n.commitment.toString()),
      public_amount: inputs.publicAmount.toString(),
      relayer: pubkeyToScalar(inputs.relayer).toString(),
      relayer_fee: inputs.relayerFee.toString(),
      // Private inputs
      input_secrets: inputs.inputNotes.map((n) => n.secret.toString()),
      input_nullifier_preimages: inputs.inputNotes.map((n) => n.nullifier.toString()),
      input_amounts: inputs.inputNotes.map((n) => n.amount.toString()),
      input_leaf_indices: inputs.inputNotes.map((n) => n.leafIndex.toString()),
      input_merkle_paths: inputs.inputMerkleProofs.map(
        (p) => p.pathElements.map((e) => e.toString())
      ),
      input_path_indices: inputs.inputMerkleProofs.map(
        (p) => p.pathIndices.map((i) => i.toString())
      ),
      output_secrets: inputs.outputNotes.map((n) => n.secret.toString()),
      output_nullifier_preimages: inputs.outputNotes.map((n) => n.nullifier.toString()),
      output_amounts: inputs.outputNotes.map((n) => n.amount.toString())
    };
    const paths = this.circuitPaths[2 /* JoinSplit */];
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      circuitInputs,
      paths.wasmPath,
      paths.zkeyPath
    );
    return this.serializeProof(proof, publicSignals);
  }
  /**
   * Serialize Groth16 proof to 256 bytes for on-chain verification
   */
  serializeProof(proof, publicSignals) {
    const proofData = new Uint8Array(256);
    const ax = hexToBytes32(bigIntToHex(BigInt(proof.pi_a[0])));
    const ay = hexToBytes32(bigIntToHex(BigInt(proof.pi_a[1])));
    proofData.set(ax, 0);
    proofData.set(ay, 32);
    const bx0 = hexToBytes32(bigIntToHex(BigInt(proof.pi_b[0][1])));
    const bx1 = hexToBytes32(bigIntToHex(BigInt(proof.pi_b[0][0])));
    const by0 = hexToBytes32(bigIntToHex(BigInt(proof.pi_b[1][1])));
    const by1 = hexToBytes32(bigIntToHex(BigInt(proof.pi_b[1][0])));
    proofData.set(bx0, 64);
    proofData.set(bx1, 96);
    proofData.set(by0, 128);
    proofData.set(by1, 160);
    const cx = hexToBytes32(bigIntToHex(BigInt(proof.pi_c[0])));
    const cy = hexToBytes32(bigIntToHex(BigInt(proof.pi_c[1])));
    proofData.set(cx, 192);
    proofData.set(cy, 224);
    const publicInputs = publicSignals.map((s) => BigInt(s));
    return { proofData, publicInputs };
  }
  assertMerkleDepth(actualDepth, proofType) {
    if (actualDepth !== this.merkleTreeDepth) {
      throw new Error(
        `Merkle depth mismatch for ${proofType} proof: expected ${this.merkleTreeDepth}, got ${actualDepth}`
      );
    }
  }
  assertCircuitArtifactsExist(proofType) {
    if (typeof globalThis !== "undefined" && "window" in globalThis) return;
    try {
      const fs = require("fs");
      const paths = this.circuitPaths[proofType];
      if (!fs.existsSync(paths.wasmPath)) {
        throw new Error(
          `Missing ${ProofType[proofType]} circuit wasm at ${paths.wasmPath}. Run: cd circuits && ./build.sh`
        );
      }
      if (!fs.existsSync(paths.zkeyPath)) {
        throw new Error(
          `Missing ${ProofType[proofType]} circuit zkey at ${paths.zkeyPath}. Run: cd circuits && ./build.sh`
        );
      }
    } catch (e) {
      if (e.code === "MODULE_NOT_FOUND") return;
      throw e;
    }
  }
};
function pubkeyToScalar(pubkey) {
  const bytes = pubkey.toBytes();
  const scalarBytes = new Uint8Array(32);
  scalarBytes.set(bytes.slice(0, 31), 1);
  let result = 0n;
  for (let i = 0; i < scalarBytes.length; i++) {
    result = result << 8n | BigInt(scalarBytes[i]);
  }
  return result;
}
function bigIntToHex(value) {
  return value.toString(16).padStart(64, "0");
}
function hexToBytes32(hex) {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}
async function verifyProofLocally(proofType, proof, publicSignals, vkeyPath) {
  const vkey = await fetch(vkeyPath).then((r) => r.json());
  return snarkjs.groth16.verify(vkey, publicSignals, proof);
}
async function exportVerificationKey(zkeyPath) {
  return snarkjs.zKey.exportVerificationKey(zkeyPath);
}

// src/types.ts
var import_bn = __toESM(require("bn.js"));
var ProofType2 = /* @__PURE__ */ ((ProofType3) => {
  ProofType3[ProofType3["Deposit"] = 0] = "Deposit";
  ProofType3[ProofType3["Withdraw"] = 1] = "Withdraw";
  ProofType3[ProofType3["JoinSplit"] = 2] = "JoinSplit";
  ProofType3[ProofType3["Membership"] = 3] = "Membership";
  return ProofType3;
})(ProofType2 || {});
function proofTypeSeed(proofType) {
  const seeds = {
    [0 /* Deposit */]: "vk_deposit",
    [1 /* Withdraw */]: "vk_withdraw",
    [2 /* JoinSplit */]: "vk_joinsplit",
    [3 /* Membership */]: "vk_membership"
  };
  return Buffer.from(seeds[proofType]);
}
var ShieldedActionType = /* @__PURE__ */ ((ShieldedActionType2) => {
  ShieldedActionType2[ShieldedActionType2["DexSwap"] = 0] = "DexSwap";
  ShieldedActionType2[ShieldedActionType2["LendingDeposit"] = 1] = "LendingDeposit";
  ShieldedActionType2[ShieldedActionType2["LendingBorrow"] = 2] = "LendingBorrow";
  ShieldedActionType2[ShieldedActionType2["Stake"] = 3] = "Stake";
  ShieldedActionType2[ShieldedActionType2["Unstake"] = 4] = "Unstake";
  ShieldedActionType2[ShieldedActionType2["Custom"] = 255] = "Custom";
  return ShieldedActionType2;
})(ShieldedActionType || {});
var SpendType = /* @__PURE__ */ ((SpendType2) => {
  SpendType2[SpendType2["Withdraw"] = 0] = "Withdraw";
  SpendType2[SpendType2["JoinSplit"] = 1] = "JoinSplit";
  SpendType2[SpendType2["ShieldedCpi"] = 2] = "ShieldedCpi";
  return SpendType2;
})(SpendType || {});
var AssetType = /* @__PURE__ */ ((AssetType2) => {
  AssetType2[AssetType2["SplToken"] = 0] = "SplToken";
  AssetType2[AssetType2["NativeSol"] = 1] = "NativeSol";
  AssetType2[AssetType2["Token2022"] = 2] = "Token2022";
  return AssetType2;
})(AssetType || {});
var MIN_TREE_DEPTH = 4;
var MAX_TREE_DEPTH = 24;
var MIN_ROOT_HISTORY_SIZE = 30;
var DEFAULT_ROOT_HISTORY_SIZE = 100;
var PROOF_SIZE = 256;
var G1_POINT_SIZE = 64;
var G2_POINT_SIZE = 128;
var MAX_METADATA_URI_LEN = 200;
var MAX_ENCRYPTED_NOTE_SIZE = 1024;
var NATIVE_SOL_ASSET_ID = new Uint8Array([
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1
]);
var FEATURE_MASP = 1 << 0;
var FEATURE_JOIN_SPLIT = 1 << 1;
var FEATURE_MEMBERSHIP = 1 << 2;
var FEATURE_SHIELDED_CPI = 1 << 3;
var FEATURE_COMPLIANCE = 1 << 4;
function toBN(value) {
  if (import_bn.default.isBN(value)) return value;
  if (typeof value === "bigint") return new import_bn.default(value.toString());
  return new import_bn.default(value);
}
function toHex(bytes) {
  return Buffer.from(bytes).toString("hex");
}
function fromHex(hex) {
  return Uint8Array.from(Buffer.from(hex, "hex"));
}
function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
function isValidCommitment(commitment) {
  if (commitment.length !== 32) return false;
  return !commitment.every((b) => b === 0);
}
function isValidNullifier(nullifier) {
  if (nullifier.length !== 32) return false;
  return !nullifier.every((b) => b === 0);
}
function isValidProofLength(proofData) {
  return proofData.length === PROOF_SIZE;
}

// src/pda.ts
var import_web3 = require("@solana/web3.js");
var PROGRAM_ID = new import_web3.PublicKey("BmtMrkgvVML9Gk7Bt6JRqweHAwW69oFTohaBRaLbgqpb");
var POOL_V2_SEED = Buffer.from("pool_v2");
var MERKLE_TREE_V2_SEED = Buffer.from("merkle_tree_v2");
var VAULT_V2_SEED = Buffer.from("vault_v2");
var NULLIFIER_V2_SEED = Buffer.from("nullifier_v2");
var RELAYER_REGISTRY_SEED = Buffer.from("relayer_registry");
var RELAYER_SEED = Buffer.from("relayer");
var COMPLIANCE_SEED = Buffer.from("compliance");
function findPoolConfigPda(programId, authority) {
  return import_web3.PublicKey.findProgramAddressSync(
    [POOL_V2_SEED, authority.toBuffer()],
    programId
  );
}
function findMerkleTreePda(programId, poolConfig) {
  return import_web3.PublicKey.findProgramAddressSync(
    [MERKLE_TREE_V2_SEED, poolConfig.toBuffer()],
    programId
  );
}
function findAssetVaultPda(programId, poolConfig, assetId) {
  if (assetId.length !== 32) {
    throw new Error("Asset ID must be 32 bytes");
  }
  return import_web3.PublicKey.findProgramAddressSync(
    [VAULT_V2_SEED, poolConfig.toBuffer(), Buffer.from(assetId)],
    programId
  );
}
function findVerificationKeyPda(programId, poolConfig, proofType) {
  const seed = proofTypeSeed(proofType);
  return import_web3.PublicKey.findProgramAddressSync(
    [seed, poolConfig.toBuffer()],
    programId
  );
}
function findSpentNullifierPda(programId, poolConfig, nullifierHash) {
  if (nullifierHash.length !== 32) {
    throw new Error("Nullifier hash must be 32 bytes");
  }
  return import_web3.PublicKey.findProgramAddressSync(
    [NULLIFIER_V2_SEED, poolConfig.toBuffer(), Buffer.from(nullifierHash)],
    programId
  );
}
function findRelayerRegistryPda(programId, poolConfig) {
  return import_web3.PublicKey.findProgramAddressSync(
    [RELAYER_REGISTRY_SEED, poolConfig.toBuffer()],
    programId
  );
}
function findRelayerNodePda(programId, registry, operator) {
  return import_web3.PublicKey.findProgramAddressSync(
    [RELAYER_SEED, registry.toBuffer(), operator.toBuffer()],
    programId
  );
}
function findComplianceConfigPda(programId, poolConfig) {
  return import_web3.PublicKey.findProgramAddressSync(
    [COMPLIANCE_SEED, poolConfig.toBuffer()],
    programId
  );
}
function computeAssetId(mint) {
  return computeAssetIdKeccak(mint.toBuffer());
}
function computeAssetIdKeccak(input) {
  try {
    const crypto2 = require("crypto");
    const hash = crypto2.createHash("sha256").update(input).digest();
    return new Uint8Array(hash);
  } catch {
    throw new Error(
      'keccak256 not available. Install @noble/hashes and use: import { keccak_256 } from "@noble/hashes/sha3"'
    );
  }
}
function derivePoolPdas(programId, authority) {
  const [poolConfig, poolConfigBump] = findPoolConfigPda(programId, authority);
  const [merkleTree, merkleTreeBump] = findMerkleTreePda(programId, poolConfig);
  const [relayerRegistry, relayerRegistryBump] = findRelayerRegistryPda(programId, poolConfig);
  const [complianceConfig, complianceConfigBump] = findComplianceConfigPda(programId, poolConfig);
  return {
    poolConfig,
    poolConfigBump,
    merkleTree,
    merkleTreeBump,
    relayerRegistry,
    relayerRegistryBump,
    complianceConfig,
    complianceConfigBump
  };
}
function deriveAssetVaultPdas(programId, poolConfig, assetIds) {
  return assetIds.map((assetId) => findAssetVaultPda(programId, poolConfig, assetId));
}
function deriveVerificationKeyPdas(programId, poolConfig) {
  return {
    [0 /* Deposit */]: findVerificationKeyPda(programId, poolConfig, 0 /* Deposit */),
    [1 /* Withdraw */]: findVerificationKeyPda(programId, poolConfig, 1 /* Withdraw */),
    [2 /* JoinSplit */]: findVerificationKeyPda(programId, poolConfig, 2 /* JoinSplit */),
    [3 /* Membership */]: findVerificationKeyPda(programId, poolConfig, 3 /* Membership */)
  };
}

// src/client.ts
var import_anchor = require("@coral-xyz/anchor");
var import_web32 = require("@solana/web3.js");
var import_spl_token = require("@solana/spl-token");
var PsolV2Client = class {
  constructor(options) {
    this.programId = options.programId ?? PROGRAM_ID;
    if (options.provider) {
      this.provider = options.provider;
    } else if (options.connection && options.wallet) {
      const wallet = {
        publicKey: options.wallet.publicKey,
        signTransaction: async (tx) => {
          tx.sign(options.wallet);
          return tx;
        },
        signAllTransactions: async (txs) => {
          txs.forEach((tx) => tx.sign(options.wallet));
          return txs;
        }
      };
      this.provider = new import_anchor.AnchorProvider(options.connection, wallet, {
        commitment: "confirmed"
      });
    } else {
      throw new Error("Either provider or connection+wallet must be provided");
    }
    if (!options.idl) {
      throw new Error("IDL must be provided");
    }
    this.program = new import_anchor.Program(options.idl, this.provider);
  }
  /**
   * Get authority public key
   */
  get authority() {
    return this.provider.publicKey;
  }
  // ============================================
  // Pool Administration
  // ============================================
  /**
   * Initialize a new MASP pool
   */
  async initializePool(treeDepth, rootHistorySize) {
    const authority = this.authority;
    const [poolConfig] = findPoolConfigPda(this.programId, authority);
    const [merkleTree] = findMerkleTreePda(this.programId, poolConfig);
    const tx = await this.program.methods.initializePoolV2(treeDepth, rootHistorySize).accounts({
      authority,
      poolConfig,
      merkleTree,
      systemProgram: import_web32.SystemProgram.programId
    }).rpc();
    return {
      signature: tx,
      poolConfig,
      merkleTree
    };
  }
  /**
   * Initialize pool registries (relayer registry, compliance config)
   */
  async initializePoolRegistries(poolConfig) {
    const authority = this.authority;
    const [relayerRegistry] = findRelayerRegistryPda(this.programId, poolConfig);
    const [complianceConfig] = findComplianceConfigPda(this.programId, poolConfig);
    return await this.program.methods.initializePoolRegistries().accounts({
      authority,
      poolConfig,
      relayerRegistry,
      complianceConfig,
      systemProgram: import_web32.SystemProgram.programId
    }).rpc();
  }
  /**
   * Register an asset (SPL token) in the pool
   */
  async registerAsset(poolConfig, mint) {
    const authority = this.authority;
    const assetId = computeAssetId(mint);
    const [assetVault] = findAssetVaultPda(this.programId, poolConfig, assetId);
    const [vaultTokenAccount] = import_web32.PublicKey.findProgramAddressSync(
      [Buffer.from("vault_token"), assetVault.toBuffer()],
      this.programId
    );
    return await this.program.methods.registerAsset(Array.from(assetId)).accounts({
      authority,
      poolConfig,
      mint,
      assetVault,
      vaultTokenAccount,
      tokenProgram: import_spl_token.TOKEN_PROGRAM_ID,
      systemProgram: import_web32.SystemProgram.programId
    }).rpc();
  }
  /**
   * Set verification key for a proof type
   */
  async setVerificationKey(poolConfig, proofType, vkAlphaG1, vkBetaG2, vkGammaG2, vkDeltaG2, vkIc) {
    const authority = this.authority;
    const [vkAccount] = findVerificationKeyPda(this.programId, poolConfig, proofType);
    return await this.program.methods.setVerificationKeyV2(
      proofType,
      Array.from(vkAlphaG1),
      Array.from(vkBetaG2),
      Array.from(vkGammaG2),
      Array.from(vkDeltaG2),
      vkIc.map((ic) => Array.from(ic))
    ).accounts({
      authority,
      poolConfig,
      vkAccount,
      systemProgram: import_web32.SystemProgram.programId
    }).rpc();
  }
  // ============================================
  // Deposits & Withdrawals
  // ============================================
  /**
   * Deposit funds into the shielded pool
   */
  async deposit(poolConfig, mint, amount, commitment, proofData, encryptedNote) {
    const depositor = this.authority;
    const assetId = computeAssetId(mint);
    const [merkleTree] = findMerkleTreePda(this.programId, poolConfig);
    const [assetVault] = findAssetVaultPda(this.programId, poolConfig, assetId);
    const [vaultTokenAccount] = import_web32.PublicKey.findProgramAddressSync(
      [Buffer.from("vault_token"), assetVault.toBuffer()],
      this.programId
    );
    const [depositVk] = findVerificationKeyPda(this.programId, poolConfig, 0 /* Deposit */);
    const userTokenAccount = (0, import_spl_token.getAssociatedTokenAddressSync)(mint, depositor);
    const tx = await this.program.methods.depositMasp(
      toBN(amount),
      Array.from(commitment),
      Array.from(assetId),
      Array.from(proofData),
      encryptedNote ? Array.from(encryptedNote) : null
    ).accounts({
      depositor,
      poolConfig,
      authority: depositor,
      merkleTree,
      assetVault,
      vaultTokenAccount,
      userTokenAccount,
      mint,
      depositVk,
      tokenProgram: import_spl_token.TOKEN_PROGRAM_ID,
      systemProgram: import_web32.SystemProgram.programId
    }).rpc();
    return {
      signature: tx,
      leafIndex: 0
      // TODO: Parse from logs
    };
  }
  /**
   * Withdraw funds from the shielded pool
   */
  async withdraw(poolConfig, mint, recipient, amount, merkleRoot, nullifierHash, proofData, relayerFee) {
    const relayer = this.authority;
    const assetId = computeAssetId(mint);
    const [merkleTree] = findMerkleTreePda(this.programId, poolConfig);
    const [assetVault] = findAssetVaultPda(this.programId, poolConfig, assetId);
    const [vaultTokenAccount] = import_web32.PublicKey.findProgramAddressSync(
      [Buffer.from("vault_token"), assetVault.toBuffer()],
      this.programId
    );
    const [withdrawVk] = findVerificationKeyPda(this.programId, poolConfig, 1 /* Withdraw */);
    const [spentNullifier] = findSpentNullifierPda(this.programId, poolConfig, nullifierHash);
    const [relayerRegistry] = findRelayerRegistryPda(this.programId, poolConfig);
    const recipientTokenAccount = (0, import_spl_token.getAssociatedTokenAddressSync)(mint, recipient);
    const relayerTokenAccount = (0, import_spl_token.getAssociatedTokenAddressSync)(mint, relayer);
    const tx = await this.program.methods.withdrawMasp(
      Array.from(proofData),
      Array.from(merkleRoot),
      Array.from(nullifierHash),
      recipient,
      toBN(amount),
      Array.from(assetId),
      toBN(relayerFee ?? 0n)
    ).accounts({
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
      tokenProgram: import_spl_token.TOKEN_PROGRAM_ID,
      systemProgram: import_web32.SystemProgram.programId
    }).rpc();
    return { signature: tx };
  }
  // ============================================
  // Account Fetchers
  // ============================================
  /**
   * Fetch pool configuration
   */
  async fetchPoolConfig(poolConfig) {
    return await this.program.account.poolConfigV2.fetch(poolConfig);
  }
  /**
   * Fetch Merkle tree state
   */
  async fetchMerkleTree(merkleTree) {
    return await this.program.account.merkleTreeV2.fetch(merkleTree);
  }
  /**
   * Fetch asset vault
   */
  async fetchAssetVault(assetVault) {
    return await this.program.account.assetVault.fetch(assetVault);
  }
  /**
   * Check if nullifier has been spent
   */
  async isNullifierSpent(poolConfig, nullifierHash) {
    const [spentNullifier] = findSpentNullifierPda(this.programId, poolConfig, nullifierHash);
    try {
      await this.program.account.spentNullifierV2.fetch(spentNullifier);
      return true;
    } catch {
      return false;
    }
  }
};
function createPsolClient(provider, idl, programId) {
  return new PsolV2Client({
    provider,
    idl,
    programId
  });
}

// src/index.ts
async function initializeSDK() {
  const { initPoseidon: initPoseidon2 } = await Promise.resolve().then(() => (init_poseidon(), poseidon_exports));
  await initPoseidon2();
}
var SDK_VERSION = "2.0.0";
var IS_PRODUCTION_READY = false;
var SDK_STATUS = "alpha";
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AssetType,
  COMPLIANCE_SEED,
  DEFAULT_CIRCUIT_PATHS,
  DEFAULT_ROOT_HISTORY_SIZE,
  FEATURE_COMPLIANCE,
  FEATURE_JOIN_SPLIT,
  FEATURE_MASP,
  FEATURE_MEMBERSHIP,
  FEATURE_SHIELDED_CPI,
  FIELD_MODULUS,
  G1_POINT_SIZE,
  G2_POINT_SIZE,
  IS_PRODUCTION_READY,
  MAX_ENCRYPTED_NOTE_SIZE,
  MAX_METADATA_URI_LEN,
  MAX_TREE_DEPTH,
  MERKLE_TREE_V2_SEED,
  MIN_ROOT_HISTORY_SIZE,
  MIN_TREE_DEPTH,
  MerkleTree,
  NATIVE_SOL_ASSET_ID,
  NULLIFIER_V2_SEED,
  NoteStore,
  POOL_V2_SEED,
  PROGRAM_ID,
  PROOF_SIZE,
  Poseidon,
  ProofType,
  Prover,
  PsolV2Client,
  RELAYER_REGISTRY_SEED,
  RELAYER_SEED,
  SDK_STATUS,
  SDK_VERSION,
  ShieldedActionType,
  SpendType,
  VAULT_V2_SEED,
  bigIntToBytes,
  bigIntToFieldBytes,
  bytesEqual,
  bytesToBigInt,
  bytesToCommitment,
  commitmentToBytes,
  computeAssetId,
  computeAssetIdKeccak,
  computeCommitment,
  computeNoteNullifier,
  computeNullifierHash,
  createNote,
  createNoteFromParams,
  createPsolClient,
  decryptNote,
  deriveAssetVaultPdas,
  derivePoolPdas,
  deriveVerificationKeyPdas,
  deserializeNote,
  encryptNote,
  exportVerificationKey,
  fieldMod,
  findAssetVaultPda,
  findComplianceConfigPda,
  findMerkleTreePda,
  findPoolConfigPda,
  findRelayerNodePda,
  findRelayerRegistryPda,
  findSpentNullifierPda,
  findVerificationKeyPda,
  fromHex,
  hashFour,
  hashTwo,
  initPoseidon,
  initializeSDK,
  isValidCommitment,
  isValidFieldElement,
  isValidNullifier,
  isValidProofLength,
  proofTypeSeed,
  pubkeyToScalar,
  randomFieldElement,
  serializeNote,
  syncTreeWithChain,
  toBN,
  toHex,
  verifyProofLocally
});
