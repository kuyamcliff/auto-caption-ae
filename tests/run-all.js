/* Runs all fast tests. Engine tests: node test-pipeline.js <apiDir> <media> */
const { execFileSync } = require('child_process');
for (const f of ['test-compat.js', 'test-unit.js', 'test-host.js']) {
  console.log('\n# ' + f);
  execFileSync(process.execPath, [require('path').join(__dirname, f)], { stdio: 'inherit' });
}
