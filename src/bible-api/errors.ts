export class ApiBibleError extends Error {
	constructor(
		message: string,
		public readonly kind: "auth" | "not-found" | "network" | "malformed-response",
	) {
		super(message);
		this.name = "ApiBibleError";
	}
}
