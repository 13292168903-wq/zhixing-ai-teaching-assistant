import {registerTicketTool} from '../../harness/ticket-tool.mjs';
export const name='teaching-policy';export const inject=['tools'];
export function apply(ctx){registerTicketTool(ctx,'teaching_policy');}
