const assert = require('assert');
const { distributeColumns } = require('./diagram.js');

assert.deepStrictEqual(distributeColumns(3, 2, 4), [2, 2, 0]);
assert.deepStrictEqual(distributeColumns(2, 2, 7 % 4), [2, 1]); // último slot de Sacos C (7 = 4+3)
assert.deepStrictEqual(distributeColumns(3, 1, 2), [1, 1, 0]);
assert.deepStrictEqual(distributeColumns(3, 1, 0), [0, 0, 0]);

console.log('Todos los tests de diagram.js pasaron correctamente.');
