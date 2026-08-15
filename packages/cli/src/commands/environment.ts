import { Command } from 'commander';
import { runSetup } from '../runners/setup.js';
import { runDoctor } from '../runners/doctor.js';

export function setupCommand(): Command {
  return new Command('setup')
    .description('Install APVG-managed browser tooling')
    .action(runSetup);
}

export function doctorCommand(): Command {
  return new Command('doctor')
    .description('Check tools, services, and configuration required by APVG')
    .action(runDoctor);
}
