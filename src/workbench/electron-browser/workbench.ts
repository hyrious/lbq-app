// This file loads in sync. Let's do all dirty jobs here.
document.currentScript?.remove();

async function main() {
	const { cssModules } = await vscode.resolveConfiguration();

	const global = globalThis as any;
	global._LOAD_CSS = function (url: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const link = document.createElement('link');
			link.rel = 'stylesheet';
			link.href = url;
			link.onload = () => resolve();
			link.onerror = () => reject(new Error(`Failed to load stylesheet: ${url}`));
			document.head.appendChild(link);
		});
	};

	const importMap: { readonly imports: { [specifier: string]: string; }; } = { imports: {} };
	for (const url of cssModules) {
		const js = `await globalThis._LOAD_CSS(${JSON.stringify(url)});\n`;
		const blob = new Blob([js], { type: 'text/javascript' });
		importMap.imports[url] = URL.createObjectURL(blob);
	}
	const importMapElement = document.createElement('script');
	importMapElement.type = 'importmap';
	importMapElement.textContent = JSON.stringify(importMap, null, 2);
	document.head.appendChild(importMapElement);

	await import("./workbench.main.ts");
}

main();
