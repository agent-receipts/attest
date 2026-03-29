import { randomUUID } from "node:crypto";
import { createReceipt } from "../receipt/create.js";
import { hashReceipt, sha256 } from "../receipt/hash.js";
import { signReceipt } from "../receipt/signing.js";
import type { Issuer, Principal } from "../receipt/types.js";
import type { ReceiptStore } from "../store/store.js";
import { classifyToolCall } from "../taxonomy/classify.js";
import type { TaxonomyMapping } from "../taxonomy/types.js";
import type { ToolCallComplete, ToolCallInterceptor } from "./interceptor.js";

/**
 * Configuration for the receipt emitter.
 */
export interface EmitterConfig {
	/** Ed25519 private key (PEM). */
	privateKey: string;
	/** DID key reference for proof.verificationMethod. */
	verificationMethod: string;
	/** Agent issuer identity. */
	issuer: Issuer;
	/** Human principal identity. */
	principal: Principal;
	/** Receipt store to persist to. */
	store: ReceiptStore;
	/** Tool name → action type mappings. */
	mappings?: TaxonomyMapping[];
	/** Chain ID (defaults to a random UUID). */
	chainId?: string;
}

/**
 * Listens to tool call completions from a ToolCallInterceptor and emits
 * signed, hash-chained receipts to the store.
 */
export class ReceiptEmitter {
	private readonly config: EmitterConfig;
	private readonly chainId: string;
	private sequence = 0;
	private previousReceiptHash: string | null = null;
	private attached = false;

	constructor(config: EmitterConfig) {
		this.config = config;
		this.chainId = config.chainId ?? `chain_${randomUUID()}`;
	}

	/**
	 * Attach to an interceptor and start emitting receipts.
	 */
	attach(interceptor: ToolCallInterceptor): void {
		if (this.attached) {
			throw new Error("Emitter is already attached to an interceptor");
		}
		this.attached = true;
		interceptor.on("tool:complete", (complete) =>
			this.handleToolComplete(complete),
		);
	}

	private handleToolComplete(complete: ToolCallComplete): void {
		const { request, error } = complete;

		const classification = classifyToolCall(
			request.toolName,
			this.config.mappings,
		);

		const parametersHash =
			request.arguments !== undefined
				? sha256(JSON.stringify(request.arguments))
				: undefined;

		this.sequence++;

		const unsigned = createReceipt({
			issuer: this.config.issuer,
			principal: this.config.principal,
			action: {
				type: classification.action_type,
				risk_level: classification.risk_level,
				...(parametersHash !== undefined && {
					parameters_hash: parametersHash,
				}),
			},
			outcome: {
				status: error ? "failure" : "success",
				...(error?.message !== undefined && { error: error.message }),
			},
			chain: {
				sequence: this.sequence,
				previous_receipt_hash: this.previousReceiptHash,
				chain_id: this.chainId,
			},
		});

		const signed = signReceipt(
			unsigned,
			this.config.privateKey,
			this.config.verificationMethod,
		);

		const receiptHash = hashReceipt(signed);
		this.config.store.insert(signed, receiptHash);
		this.previousReceiptHash = receiptHash;
	}

	/**
	 * The chain ID for this emitter session.
	 */
	getChainId(): string {
		return this.chainId;
	}

	/**
	 * Number of receipts emitted so far.
	 */
	getSequence(): number {
		return this.sequence;
	}
}
