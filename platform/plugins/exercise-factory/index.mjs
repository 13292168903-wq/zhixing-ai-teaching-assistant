import {registerTicketTool} from '../../harness/ticket-tool.mjs';
export const name='exercise-factory';export const inject=['tools'];
export function apply(ctx){registerTicketTool(ctx,'exercise_factory');}
