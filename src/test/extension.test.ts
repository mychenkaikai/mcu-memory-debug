import * as assert from 'assert';
import * as vscode from 'vscode';
import * as mocha from 'mocha';

describe('Extension Test Suite', () => {
	before(() => {
		vscode.window.showInformationMessage('Start all tests.');
	});

	describe('Basic Tests', () => {
		it('Sample test', () => {
			assert.strictEqual(-1, [1, 2, 3].indexOf(5));
			assert.strictEqual(-1, [1, 2, 3].indexOf(0));
		});
	});
});
