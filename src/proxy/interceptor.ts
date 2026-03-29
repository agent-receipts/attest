import { EventEmitter } from "node:events";
import type { JsonRpcMessage, McpProxy } from "./proxy.js";

/**
 * A tools/call request extracted from the JSON-RPC stream.
 */
export interface ToolCallRequest {
	/** JSON-RPC request id. */
	id: string | number;
	/** MCP tool name. */
	toolName: string;
	/** Tool arguments (opaque). */
	arguments: unknown;
}

/**
 * A completed tool call: request paired with its response.
 */
export interface ToolCallComplete {
	request: ToolCallRequest;
	/** The JSON-RPC result (if successful). */
	result?: unknown;
	/** The JSON-RPC error (if failed). */
	error?: { code: number; message: string; data?: unknown };
}

export interface InterceptorEvents {
	"tool:request": [request: ToolCallRequest];
	"tool:complete": [complete: ToolCallComplete];
}

/**
 * Intercepts tools/call requests and responses flowing through an McpProxy,
 * pairing them by JSON-RPC id.
 */
export class ToolCallInterceptor extends EventEmitter<InterceptorEvents> {
	private pending = new Map<string | number, ToolCallRequest>();
	private attached = false;

	/**
	 * Attach to a proxy and start intercepting tools/call messages.
	 *
	 * @throws If already attached to a proxy.
	 */
	attach(proxy: McpProxy): void {
		if (this.attached) {
			throw new Error("Interceptor is already attached to a proxy");
		}
		this.attached = true;
		proxy.on("message:client", (msg) => this.handleClientMessage(msg));
		proxy.on("message:server", (msg) => this.handleServerMessage(msg));
		proxy.on("close", () => this.clearPending());
	}

	private handleClientMessage(msg: JsonRpcMessage): void {
		if (msg.method !== "tools/call" || msg.id === undefined) return;

		const params = msg.params as
			| { name?: string; arguments?: unknown }
			| undefined;

		const request: ToolCallRequest = {
			id: msg.id,
			toolName: params?.name ?? "unknown",
			arguments: params?.arguments,
		};

		this.pending.set(msg.id, request);
		this.emit("tool:request", request);
	}

	private handleServerMessage(msg: JsonRpcMessage): void {
		if (msg.id === undefined) return;

		const request = this.pending.get(msg.id);
		if (!request) return;

		this.pending.delete(msg.id);

		const complete: ToolCallComplete = {
			request,
			result: msg.result,
			error: msg.error,
		};

		this.emit("tool:complete", complete);
	}

	/**
	 * Number of requests awaiting responses.
	 */
	get pendingCount(): number {
		return this.pending.size;
	}

	/**
	 * Clear all pending requests (e.g. on proxy close).
	 */
	clearPending(): void {
		this.pending.clear();
	}
}
