import { resolve } from 'node:path';
import {
  allModules,
  checkModule,
  checkShared,
  inspectDependencies,
  projectRoot,
} from '../test/architecture/boundaries';
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
const adapterFile = resolve(
  projectRoot,
  'src/modules/client/infrastructure/integrations/example.ts',
);

describe('Clean Architecture boundaries', () => {
  it('covers every module under src/modules', () => {
    expect(allModules()).toEqual([
      'auth',
      'billing',
      'budget',
      'client',
      'notification',
      'parts-dispatch',
      'purchase-order',
      'service-catalog',
      'service-order',
      'stock',
      'vehicle',
    ]);
  });

  describe.each(allModules())('%s module', (moduleName) => {
    it('keeps domain and application independent of infrastructure and frameworks, and talks to other modules only through their domain and application', () => {
      expect(checkModule(moduleName)).toEqual([]);
    });
  });

  it('keeps shared/domain, shared/application and shared/identity core framework-free', () => {
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
      "import { normalizeLoginEmail } from '../../../../shared/identity/http/login-credentials';",
      "import { PrismaUserRepository } from '../../../../shared/identity/infrastructure/persistence/prisma-user.repository';",
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

    it('lets an adapter reach another module only through domain and application', () => {
      const allowed = [
        "import { Injectable } from '@nestjs/common';",
        "import { FindVehicleUseCase } from '../../../vehicle/application/use-cases/find-vehicle.use-case';",
        "import { Vehicle } from '../../../vehicle/domain/entities/vehicle.entity';",
        "import { Role } from '../../../../../generated/prisma/enums';",
        "import { ClientRepositoryPort } from '../../application/ports/client-repository.port';",
        "import { randomUUID } from 'node:crypto';",
        "import { UserRepositoryPort } from '../../../../shared/identity/application/ports/user-repository.port';",
      ].join('\n');
      expect(inspectDependencies('client', adapterFile, allowed)).toEqual([]);

      expect(
        inspectDependencies(
          'client',
          adapterFile,
          "import { PrismaVehicleRepository } from '../../../vehicle/infrastructure/persistence/prisma-vehicle.repository';",
        ),
      ).toHaveLength(1);
      expect(
        inspectDependencies(
          'client',
          adapterFile,
          "import { VehicleController } from '../../../vehicle/presentation/http/vehicle.controller';",
        ),
      ).toHaveLength(1);
      expect(
        inspectDependencies('client', adapterFile, 'import(somewhere);'),
      ).toHaveLength(1);
    });

    it('rejects files outside the module layers', () => {
      expect(() =>
        inspectDependencies(
          'client',
          resolve(projectRoot, 'src/modules/client/client.module.ts'),
          '',
        ),
      ).toThrow(/not under a layer of client/);
    });
  });
});

describe('Module graph', () => {
  // A extração do despacho de peças para o módulo parts-dispatch desfez o
  // único ciclo da Fase 1. Daqui em diante o grafo é acíclico.
  it('has no cycles between modules', () => {
    expect(moduleCycles()).toEqual([]);
  });

  it('never needs forwardRef', () => {
    expect(forwardRefUsages()).toEqual([]);
  });
});
