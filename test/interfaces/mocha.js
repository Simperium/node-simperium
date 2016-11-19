type Spec = ( done: Function ) => ?Promise<any>

declare class describe {
	static ( description: string, spec: ()=>void ): void;
}

declare class it {
	static ( description: string, spec: Spec ): void;
}

declare class before {
	static ( spec: Spec ): void;
}

declare class beforeEach {
	static ( spec: Spec ): void;
}
