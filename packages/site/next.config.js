// Tell webpack to compile the "bar" package, necessary if you're using the export statement for example
// https://www.npmjs.com/package/next-transpile-modules
import nextTranspileModules from 'next-transpile-modules'

const withTM = nextTranspileModules(process.env.NODE_ENV === 'development' ? ['@radist2s/app'] : [])

const config = withTM();

export default config;
