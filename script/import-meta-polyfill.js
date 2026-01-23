import { fileURLToPath } from 'url';
import { dirname } from 'path';

const getFilename = () => typeof __filename !== 'undefined' ? __filename : '';
const getDirname = () => typeof __dirname !== 'undefined' ? __dirname : '';

export { getFilename as __importMetaFilename, getDirname as __importMetaDirname };
