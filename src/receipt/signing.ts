import { generateKeyPairSync, sign, verify } from "node:crypto";
import type { ActionReceipt, Proof, UnsignedActionReceipt } from "./types.js";

export interface KeyPair {
	publicKey: string;
	privateKey: string;
}

/**
 * Generate an Ed25519 key pair (PEM-encoded).
 */
export function generateKeyPair(): KeyPair {
	const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
		publicKeyEncoding: { type: "spki", format: "pem" },
		privateKeyEncoding: { type: "pkcs8", format: "pem" },
	});
	return { publicKey, privateKey };
}

/**
 * Recursively sort object keys for deterministic serialization.
 *
 * Uses sorted-key JSON as a stepping stone;
 * full RFC 8785 (JCS) canonicalization is planned in issue #6.
 */
function sortKeys(value: unknown): unknown {
	if (value === null || typeof value !== "object") return value;
	if (Array.isArray(value)) return value.map(sortKeys);
	const sorted: Record<string, unknown> = {};
	for (const key of Object.keys(value).sort()) {
		sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
	}
	return sorted;
}

function canonicalize(receipt: UnsignedActionReceipt): Buffer {
	return Buffer.from(JSON.stringify(sortKeys(receipt)), "utf-8");
}

/**
 * Sign an unsigned receipt, returning a complete ActionReceipt with proof.
 */
export function signReceipt(
	unsigned: UnsignedActionReceipt,
	privateKey: string,
	verificationMethod: string,
): ActionReceipt {
	const data = canonicalize(unsigned);
	const signature = sign(null, data, privateKey);

	const proof: Proof = {
		type: "Ed25519Signature2020",
		created: new Date().toISOString(),
		verificationMethod,
		proofPurpose: "assertionMethod",
		proofValue: `z${signature.toString("base64")}`,
	};

	return { ...unsigned, proof };
}

/**
 * Verify the Ed25519 signature on a signed receipt.
 */
export function verifyReceipt(
	receipt: ActionReceipt,
	publicKey: string,
): boolean {
	const { proof, ...unsigned } = receipt;
	const data = canonicalize(unsigned as UnsignedActionReceipt);

	const signatureBase64 = proof.proofValue.slice(1); // strip leading 'z'
	const signature = Buffer.from(signatureBase64, "base64");

	return verify(null, data, publicKey, signature);
}
