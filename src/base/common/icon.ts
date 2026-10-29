export interface ICarbonIcons {
	readonly width: number;
	readonly height: number;
	readonly icons: Readonly<Record<string, { readonly body: string; }>>;
	readonly aliases: Readonly<Record<string, { readonly parent: string; }>>;
}
