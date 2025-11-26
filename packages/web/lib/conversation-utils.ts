import type { ConversationMessage } from '@/lib/account-api';

export const getMessageRole = (message: ConversationMessage): string => (message.role || '').toLowerCase();

export const getMessageParticipantId = (message: ConversationMessage): string => {
  if (typeof message.partner_id === 'string' && message.partner_id) {
    return message.partner_id.toLowerCase();
  }
  return '';
};
