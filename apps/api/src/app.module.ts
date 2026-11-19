import { Module } from '@nestjs/common';
import {
  AuthController, BrokerController, EtfController, HealthController, JobsController, MeController, PlanController,
  ReadController, SimulationController,
} from './controllers';
import { AuthGuard } from './auth';

@Module({
  controllers: [
    HealthController, AuthController, MeController, BrokerController, EtfController, PlanController, ReadController,
    SimulationController, JobsController,
  ],
  providers: [AuthGuard],
})
export class AppModule {}
