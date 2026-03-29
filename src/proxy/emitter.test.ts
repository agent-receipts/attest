import { dirname, join } from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashReceipt } from "../receipt/hash.js";
import { generateKeyPair, verifyReceipt } from "../receipt/signing.js";
import type { ReceiptStore } from "../store/store.js";
import { openStore } from "../store/store.js";
import type { EmitterConfig } from "./emitter.js";
import { ReceiptEmitter } from "./emitter.js";
import { ToolCallInterceptor } from "./interceptor.js";
import type { JsonRpcMessage } from "./proxy.js";
import { McpProxy } from "./proxy.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ECHO_SERVER = join(__dirname, "fixtures", "echo-server.mjs");

describe("ReceiptEmitter", () => {
	let proxy: McpProxy;
	let interceptor: ToolCallInterceptor;
	let emitter: ReceiptEmitter;
	let store: ReceiptStore;
	let publicKey: string;
	let clientIn: PassThrough;
	let clientOut: PassThrough;

	beforeEach(() => {
		const keys = generateKeyPair();
		publicKey = keys.publicKey;
		store = openStore(":memory:");

		proxy = new McpProxy("node", [ECHO_SERVER]);
		interceptor = new ToolCallInterceptor();
		interceptor.attach(proxy);

		const config: EmitterConfig = {
			privateKey: keys.privateKey,
			verificationMethod: "did:agent:test#key-1",
			issuer: { id: "did:agent:test" },
			principal: { id: "did:user:test" },
			store,
			mappings: [
				{
					tool_name: "read_file",
					action_type: "filesystem.file.read",
				},
			],
			chainId: "chain_test",
		};

		emitter = new ReceiptEmitter(config);
		emitter.attach(interceptor);

		clientIn = new PassThrough();
		clientOut = new PassThrough();
		proxy.start(clientIn, clientOut);
	});

	afterEach(() => {
		proxy.stop();
		store.close();
	});

	async function sendToolCall(
		toolName: string,
		args: unknown,
		id = 1,
	): Promise<void> {
		const msg: JsonRpcMessage = {
			jsonrpc: "2.0",
			id,
			method: "tools/call",
			params: { name: toolName, arguments: args },
		};
		clientIn.write(`${JSON.stringify(msg)}\n`);
		await readLine(clientOut);
	}

	it("emits a signed receipt to the store on tool call", async () => {
		await sendToolCall("read_file", { path: "/tmp/test" });

		const chain = store.getChain("chain_test");
		expect(chain).toHaveLength(1);

		const receipt = chain[0];
		expect(receipt).toBeDefined();
		expect(receipt?.credentialSubject.action.type).toBe("filesystem.file.read");
		expect(receipt?.credentialSubject.action.risk_level).toBe("low");
		expect(receipt?.credentialSubject.outcome.status).toBe("success");
	});

	it("signs receipts with valid Ed25519 signature", async () => {
		await sendToolCall("read_file", { path: "/tmp/test" });

		const chain = store.getChain("chain_test");
		const receipt = chain[0];
		expect(receipt).toBeDefined();
		if (receipt) {
			expect(verifyReceipt(receipt, publicKey)).toBe(true);
		}
	});

	it("hash-chains multiple receipts", async () => {
		await sendToolCall("read_file", { path: "/a" }, 1);
		await sendToolCall("read_file", { path: "/b" }, 2);

		const chain = store.getChain("chain_test");
		expect(chain).toHaveLength(2);

		const first = chain[0];
		const second = chain[1];
		expect(first?.credentialSubject.chain.sequence).toBe(1);
		expect(first?.credentialSubject.chain.previous_receipt_hash).toBeNull();

		expect(second?.credentialSubject.chain.sequence).toBe(2);
		if (first) {
			expect(second?.credentialSubject.chain.previous_receipt_hash).toBe(
				hashReceipt(first),
			);
		}
	});

	it("classifies unmapped tools as unknown", async () => {
		await sendToolCall("some_custom_tool", {});

		const chain = store.getChain("chain_test");
		expect(chain[0]?.credentialSubject.action.type).toBe("unknown");
		expect(chain[0]?.credentialSubject.action.risk_level).toBe("medium");
	});

	it("hashes tool arguments", async () => {
		await sendToolCall("read_file", { path: "/tmp/test" });

		const chain = store.getChain("chain_test");
		const receipt = chain[0];
		expect(receipt?.credentialSubject.action.parameters_hash).toMatch(
			/^sha256:[0-9a-f]{64}$/,
		);
	});

	it("tracks sequence and chain id", async () => {
		expect(emitter.getSequence()).toBe(0);
		expect(emitter.getChainId()).toBe("chain_test");

		await sendToolCall("read_file", {}, 1);
		expect(emitter.getSequence()).toBe(1);

		await sendToolCall("read_file", {}, 2);
		expect(emitter.getSequence()).toBe(2);
	});

	it("records failure status when tool call errors", () => {
		// Emit a tool:complete with error directly (no proxy round-trip needed)
		interceptor.emit("tool:complete", {
			request: { id: 99, toolName: "read_file", arguments: {} },
			error: { code: -1, message: "File not found" },
		});

		const chain = store.getChain("chain_test");
		expect(chain).toHaveLength(1);
		expect(chain[0]?.credentialSubject.outcome.status).toBe("failure");
		expect(chain[0]?.credentialSubject.outcome.error).toBe("File not found");
	});

	it("sets issuer and principal on receipts", async () => {
		await sendToolCall("read_file", {});

		const chain = store.getChain("chain_test");
		expect(chain[0]?.issuer.id).toBe("did:agent:test");
		expect(chain[0]?.credentialSubject.principal.id).toBe("did:user:test");
	});
});

function readLine(stream: PassThrough): Promise<string> {
	return new Promise((resolve, reject) => {
		let buffer = "";
		const timer = setTimeout(
			() => reject(new Error("Timeout waiting for line")),
			5000,
		);
		const onData = (chunk: Buffer) => {
			buffer += chunk.toString();
			const newlineIdx = buffer.indexOf("\n");
			if (newlineIdx !== -1) {
				clearTimeout(timer);
				stream.off("data", onData);
				resolve(buffer.slice(0, newlineIdx));
			}
		};
		stream.on("data", onData);
	});
}
