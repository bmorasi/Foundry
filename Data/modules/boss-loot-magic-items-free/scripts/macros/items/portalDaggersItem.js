import { MODULE_NAME, SHORT_MODULE_NAME, SELECT_ONE_TARGET } from '../../constants.js';
import { helperData as helpers } from '../../helperFunctions.js';
import { log } from '../../boss-loot-log.js';

//------------------------
// M A I N
//-----------
async function primeItemPostAttackRoll({ speaker, actor, token, character, item, args, scope, workflow }) {
  const itemNameNormalized = helpers.normalizeItemName(item.name);
  const artWorkChatCardStatic = `modules/${MODULE_NAME}/artwork/006-portal-daggers/art-static-portal-dagger-prime.webp`;
  const artWorkChatCardAnimated = `modules/${MODULE_NAME}/artwork/006-portal-daggers/art-animated-for-chat-portal-dagger-prime.gif`;

  await helpers.replaceChatArtwork(workflow.itemCardId, artWorkChatCardAnimated);
}

async function secundusItemPostAttackRoll({ speaker, actor, token, character, item, args, scope, workflow }) {
  const itemNameNormalized = helpers.normalizeItemName(item.name);
  const artWorkChatCardStatic = `modules/${MODULE_NAME}/artwork/006-portal-daggers/art-static-portal-dagger-secundus.webp`;
  const artWorkChatCardAnimated = `modules/${MODULE_NAME}/artwork/006-portal-daggers/art-animated-for-chat-portal-dagger-secundus.gif`;

  await helpers.replaceChatArtwork(workflow.itemCardId, artWorkChatCardAnimated);
}

async function tertiusItemPostAttackRoll({ speaker, actor, token, character, item, args, scope, workflow }) {
  const itemNameNormalized = helpers.normalizeItemName(item.name);
  const artWorkChatCardStatic = `modules/${MODULE_NAME}/artwork/006-portal-daggers/art-static-portal-dagger-tertius.webp`;
  const artWorkChatCardAnimated = `modules/${MODULE_NAME}/artwork/006-portal-daggers/art-animated-for-chat-portal-dagger-tertius.gif`;

  await helpers.replaceChatArtwork(workflow.itemCardId, artWorkChatCardAnimated);
}

async function quartusItemPostAttackRoll({ speaker, actor, token, character, item, args, scope, workflow }) {
  const itemNameNormalized = helpers.normalizeItemName(item.name);
  const artWorkChatCardStatic = `modules/${MODULE_NAME}/artwork/006-portal-daggers/art-static-portal-dagger-quartus.webp`;
  const artWorkChatCardAnimated = `modules/${MODULE_NAME}/artwork/006-portal-daggers/art-animated-for-chat-portal-dagger-quartus.gif`;

  await helpers.replaceChatArtwork(workflow.itemCardId, artWorkChatCardAnimated);
}

export const portalDaggersItem = {
  primeItemPAR: primeItemPostAttackRoll,
  secundusItemPAR: secundusItemPostAttackRoll,
  tertiusItemPAR: tertiusItemPostAttackRoll,
  quartusItemPAR: quartusItemPostAttackRoll,
};
