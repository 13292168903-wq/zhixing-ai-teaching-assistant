import {registerTicketTool} from '../../harness/ticket-tool.mjs';
export const name='evaluation-factory';
export const inject=['tools'];
export function apply(ctx){registerTicketTool(ctx,'evaluation_factory');}
