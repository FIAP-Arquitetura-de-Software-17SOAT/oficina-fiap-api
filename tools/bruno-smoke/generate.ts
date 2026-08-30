import { generateCollection } from './adapter';
import { collection } from './flow';

generateCollection(collection).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
