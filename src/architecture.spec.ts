import { resolve } from 'node:path';
import {
  checkModule,
  checkShared,
  inspectDependencies,
  projectRoot,
} from '../test/architecture/boundaries';
import { MIGRATED_MODULES } from '../test/architecture/migrated-modules';
import {
  forwardRefUsages,
  moduleCycles,
} from '../test/architecture/module-graph';

const applicationFile = resolve(
  projectRoot,
  'src/modules/client/application/use-cases/example.ts',
);
const domainFile = resolve(
  projectRoot,
  'src/modules/client/domain/entities/example.ts',
);

describe('Clean Architecture boundaries', () => {
  describe.each(MIGRATED_MODULES)('%s module', (moduleName) => {
    it('keeps domain and application independent of infrastructure and frameworks', () => {
      expect(checkModule(moduleName)).toEqual([]);
    });
  });

  it('keeps shared/domain and shared/application framework-free', () => {
    expect(checkShared()).toEqual([]);
  });

  describe('checker', () => {
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
      "import { Vehicle } from '../../../vehicle/entities/vehicle.entity';",
      'const moduleName = getModuleName(); import(moduleName);',
    ])('detects a forbidden dependency in %s', (source) => {
      expect(
        inspectDependencies('client', applicationFile, source).length,
      ).toBeGreaterThan(0);
    });

    it('prevents domain from importing application, including type-only imports', () => {
      expect(
        inspectDependencies(
          'client',
          domainFile,
          "import type { ClientRepositoryPort } from '../../application/ports/client-repository.port';",
        ),
      ).toHaveLength(1);
    });

    it('allows domain, shared domain, shared application and crypto', () => {
      const source = [
        "import { Client } from '../../domain/entities/client.entity';",
        "import { DomainException } from '../../../../shared/domain/domain.exception';",
        "import { ApplicationError } from '../../../../shared/application/application.error';",
        "import { randomUUID } from 'node:crypto';",
      ].join('\n');
      expect(inspectDependencies('client', applicationFile, source)).toEqual(
        [],
      );
    });

    it('rejects files outside domain and application', () => {
      expect(() =>
        inspectDependencies(
          'client',
          resolve(projectRoot, 'src/modules/client/client.module.ts'),
          '',
        ),
      ).toThrow(/not under client\/domain or client\/application/);
    });
  });
});

describe('Module graph', () => {
  // Estado herdado da Fase 1: um único ciclo entre os quatro módulos ligados
  // pelo despacho de peças. A PR do módulo parts-dispatch zera esta lista.
  const knownCycle = ['budget', 'purchase-order', 'service-order', 'stock'];

  it('has no cycles besides the known parts-dispatch cluster', () => {
    expect(moduleCycles()).toEqual([knownCycle]);
  });

  it('only uses forwardRef inside the known cycle', () => {
    for (const file of forwardRefUsages()) {
      const moduleName = file.split('/')[2];
      expect(knownCycle).toContain(moduleName);
    }
  });
});
