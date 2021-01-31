import json from '@rollup/plugin-json';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';

export default [
    {
        // server build transpiled
        input: 'src/package/serverExports.js',
        external: ['fs', 'bufferutil', 'utf-8-validate'],
        output: [
            {
                file: 'dist/server/lance-gg.js',
                format: 'cjs',
                sourcemap: true
            },
            {
                file: 'dist/server/lance-gg.esm.js',
                format: 'esm',
                sourcemap: true
            }
        ],
        plugins: [
            resolve(),
            commonjs(),
            json(),
            typescript()
        ]
    },
    {
        // client build transpiled
        input: 'src/package/clientExports.js',
        output: [{ file: 'dist/client/lance-gg.js', format: 'umd', name: 'Client', sourcemap: true }],
        plugins: [
            resolve({ browser: true, preferBuiltins: false }),
            commonjs(),
            json(),
            typescript()
        ]
    },
];
