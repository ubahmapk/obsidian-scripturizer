export class CrosswayError extends Error {
	constructor(
		message: string,
		public readonly kind: "auth" | "not-found" | "network" | "malformed-response" | "verse-mismatch",
	) {
		super(message);
		this.name = "CrosswayError";
	}
}