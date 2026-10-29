import assert from 'node:assert/strict';
import { suite, test } from 'node:test';
import { createServiceIdentifier, InstantiationService } from './instantiation.ts';

const IService1 = createServiceIdentifier<IService1>('service1');

interface IService1 {
	c: number;
}

class Service1 implements IService1 {
	c = 1;
}

suite('Instantiation Service', () => {
	test('should work', function () {
		const service = new InstantiationService();
		service.register(IService1, Service1);
		assert.strictEqual(service.get(IService1).c, 1);
	});
});
