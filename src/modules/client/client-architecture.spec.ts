import { resolve } from 'node:path';
import {
  inspectClientDependencies,
  checkClientArchitecture,
} from '../../../test/client-architecture-check';

const root = resolve(__dirname, '../../..');
const applicationFile = resolve(
  root,
  'src/modules/client/application/use-cases/example.ts',
);
const domainFile = resolve(
  root,
  'src/modules/client/domain/entities/example.ts',
);

describe('Client architecture boundaries', () => {
  it('keeps domain and application independent of infrastructure and frameworks', () => {
    expect(checkClientArchitecture()).toEqual([]);
  });

  it.each([
    "import { Injectable } from '@nestjs/common';",
    "import type { Prisma } from '@prisma/client';",
    "export { ClientController } from '../../presentation/http/client.controller';",
    "const repository = import('../../infrastructure/persistence/prisma-client.repository');",
    "const prisma = require('../../../../../generated/prisma/client');",
    "type Controller = import('../../presentation/http/client.controller').ClientController;",
    "import Controller = require('../../presentation/http/client.controller');",
    "import { ClientController } from 'src/modules/client/presentation/http/client.controller';",
    "import { normalizeLoginEmail } from '../../../../shared/identity/login-credentials';",
    'const moduleName = getModuleName(); import(moduleName);',
  ])('detects a forbidden dependency in %s', (source) => {
    expect(
      inspectClientDependencies(applicationFile, source).length,
    ).toBeGreaterThan(0);
  });

  it('prevents domain from importing application, including type-only imports', () => {
    expect(
      inspectClientDependencies(
        domainFile,
        "import type { ClientRepositoryPort } from '../../application/ports/client-repository.port';",
      ),
    ).toHaveLength(1);
  });

  it('allows domain, shared domain and standard crypto dependencies', () => {
    const source = [
      "import { Client } from '../../domain/entities/client.entity';",
      "import { DomainException } from '../../../../shared/domain/domain.exception';",
      "import { randomUUID } from 'node:crypto';",
    ].join('\n');
    expect(inspectClientDependencies(applicationFile, source)).toEqual([]);
  });
});
