import { MODULE_NAME, SHORT_MODULE_NAME } from '../../constants.js';
import { helperData as helpers } from '../../helperFunctions.js';
import { portalDaggersAbility } from '../../items/portalDaggersAbility.js';
import { log } from '../../boss-loot-log.js';

//------------------------
// F U N C T I O N S
//-----------
function isPointInSquare(point, tokenDocument) {
  const gridSize = canvas.scene.grid.size;
  const h = tokenDocument.height * gridSize;
  const w = tokenDocument.width * gridSize;
  const { x: x0, y: y0 } = point;
  const { x: x1, y: y1 } = tokenDocument;
  const x2 = tokenDocument.x + w;
  const y2 = tokenDocument.y;
  const x3 = tokenDocument.x + w;
  const y3 = tokenDocument.y + h;
  const x4 = tokenDocument.x;
  const y4 = tokenDocument.y + h;

  const minX = Math.min(x1, x2, x3, x4);
  const maxX = Math.max(x1, x2, x3, x4);
  const minY = Math.min(y1, y2, y3, y4);
  const maxY = Math.max(y1, y2, y3, y4);

  return x0 >= minX && x0 <= maxX && y0 >= minY && y0 <= maxY;
}

async function teleportToken(itemNameNormalized, nextPortalId, tokenDoc, position) {
  if (position.length === 1) {
    log(`${tokenDoc.name} will teleport to ${nextPortalId}`, itemNameNormalized);
    const portalCoords = { x: position[0].data.source.x, y: position[0].data.source.y };

    await new Sequence()
      .animation()
      .on(tokenDoc)
      .opacity(0)
      .animation()
      .on(tokenDoc)
      .teleportTo(portalCoords, { delay: 450 })
      .snapToGrid()
      .closestSquare()
      .waitUntilFinished()
      .animation()
      .on(tokenDoc)
      .opacity(1)
      .play();
  } else {
    log(`${tokenDoc.name} cannot teleport to '${nextPortalId}' because the Portal does not exist!`, itemNameNormalized);
  }
}

async function playVisuals(fromToken, toTemplate, itemName, portalId, filterData) {
  // Select file for portal
  const elevation = fromToken.document.elevation;
  const jb2aId = 'jb2a_patreon';
  let jb2aPortalBrightYellow = '';
  if (game.modules.get(jb2aId)?.active) {
    jb2aPortalBrightYellow = 'jb2a.portals.vertical.ring.yellow';
  } else {
    jb2aPortalBrightYellow = 'jb2a.portals.vertical.ring.bright_yellow';
  }

  await new Sequence()
    //Impact
    .effect()
    .file('jb2a.impact.010.orange')
    .atLocation(fromToken)
    .scaleToObject(2)
    .scaleOut(0, 250)
    .randomRotation()
    .elevation(elevation)

    //Dagger Throw
    .effect()
    .file('jb2a.dagger.throw.01.white')
    .name(itemName)
    .atLocation(fromToken)
    .template({ gridSize: 200, startPoint: 200, endPoint: 200 })
    .stretchTo(toTemplate, { onlyX: true })
    .filter('ColorMatrix', { brightness: 1, contrast: 2, saturate: -1 })
    .spriteOffset({ x: 0.5 }, { gridUnits: true })
    .endTimePerc(0.9)
    .persist()
    .noLoop()
    .elevation(elevation)
    .zIndex(1)

    //Flash
    .effect()
    .from(fromToken)
    .atLocation(fromToken)
    .filter('ColorMatrix', { saturate: -1, brightness: 10 })
    .scaleToObject(1)
    .filter('Blur', { blurX: 5, blurY: 10 })
    .duration(600)
    .scaleOut(0, 500, { ease: 'easeOutCubic' })
    .fadeOut(600)
    .elevation(elevation)
    .waitUntilFinished(500)

    //Portal
    .effect()
    .file(jb2aPortalBrightYellow)
    .name(portalId)
    .filter('ColorMatrix', filterData)
    .atLocation(toTemplate)
    .scale(0.7)
    .scaleIn(0, 500, { ease: 'easeOutCubic' })
    .scaleOut(0, 500, { ease: 'easeInQuint' })
    .rotateTowards(fromToken, { cacheLocation: true })
    .spriteRotation(90)
    .anchor({ x: 0.6, y: 0.5 })
    .elevation(elevation)
    .persist()

    .play();
}

async function checkDistance(crosshairs, token, distanceAvailable, itemImage) {
  let crosshairsDistance = 0;
  while (crosshairs.inFlight) {
    //wait for initial render
    await warpgate.wait(100);

    const ray = new Ray(token.center, crosshairs);
    const distance = canvas.grid.measureDistances([{ ray }], { gridSpaces: true })[0];

    //only update if the distance has changed
    if (crosshairsDistance !== distance) {
      crosshairsDistance = distance;
      if (distance > distanceAvailable) {
        crosshairs.icon = 'icons/svg/hazard.svg';
      } else {
        crosshairs.icon = itemImage;
      }

      crosshairs.draw();
      crosshairs.label = `${distance} ft`;
    }
  }
}

async function deleteItem(sourceActor, itemName) {
  // Delete the dagger from Inventory
  const itemToDelete = sourceActor.items.getName(itemName);
  if (itemToDelete) {
    await itemToDelete.delete();
    log(`Deleted item ${itemName} from inventory of ${sourceActor.name}`, helpers.normalizeItemName(itemName));
  } else {
    log(`Could not find item ${itemName} in player's inventory! Item was not deleted!`);
  }
}

async function primeItemAfterActiveEffects({ speaker, actor, token, character, item, args, scope, workflow }) {
  const itemName = helpers.getItemSource(item);
  const itemNameNormalized = helpers.normalizeItemName(itemName);
  const nextItemName = 'Secundus Portal Dagger';
  const portalName = 'Prime Portal';
  const portalId = 'Prime-Portal';
  const nextPortalId = 'Secundus-Portal';
  const info = args[0];
  const distanceAvailable = Math.max(item.system.range.value || 0, item.system.range.long || 0) || 60;
  const artWorkChatCardStatic = `modules/${MODULE_NAME}/artwork/006-portal-daggers/art-static-portal-dagger-prime.webp`;
  const artWorkChatCardAnimated = `modules/${MODULE_NAME}/artwork/006-portal-daggers/art-animated-for-chat-portal-dagger-prime.gif`;

  const abilitySelection = `<div class="dnd5e chat-card item-card midi-qol-item-card">
      <header class="card-header flexrow">
        <img src="${artWorkChatCardStatic}" title="${itemNameNormalized}" width="36" height="36" />
        <h3 class="item-name">${itemNameNormalized}</h3>
      </header>
      <div class="card-content">
        <p style="font-family: Arial; font-weight: ${CONST.FONT_WEIGHTS.Bold}">Do you want to enter in portal or pull the dagger and close the portal?</p>
        <br />
      </div>
      </div>`;

  await helpers.replaceChatArtwork(info.itemCardId, artWorkChatCardAnimated, artWorkChatCardStatic);

  // Locally because of the hook
  async function initiateDialog(tokenDoc, position) {
    await new Dialog(
      {
        title: 'Ability',
        content: abilitySelection,
        buttons: {
          button1: {
            icon: "<i class='fa-light fa-person-to-portal'></i>",
            label: 'Enter Portal',
            callback: async () => await teleportToken(itemNameNormalized, nextPortalId, tokenDoc, position),
          },
          button2: {
            icon: "<i class='fa-light fa-dagger'></i>",
            label: 'Pull the dagger',
            callback: async () => {
              /// HOOK OFF
              Hooks.off('updateToken', game.PrimePortalDaggerHookClientSpecificId);
              log(`Deleted the Hook "updateToken" with ID = ${game.PrimePortalDaggerHookClientSpecificId}`, itemNameNormalized);
              delete game.PrimePortalDaggerHookClientSpecificId;

              await Sequencer.EffectManager.endEffects({ name: portalId });
              await Sequencer.EffectManager.endEffects({ name: itemNameNormalized });
              const message = `<p>With a firm grip, you grasp the hilt of the <strong>${itemNameNormalized}</strong> and give it a sharp tug. The blade easily slides out of the wall, the portal it had opened closing in an instant. The magical bond between the dagger and yourself remains, its power still pulsing within you. You secure the blade at your side, ready to use its power again in your journey.</p>`;
              await helpers.createChatMessage(itemNameNormalized, message, itemNameNormalized, artWorkChatCardStatic, artWorkChatCardAnimated);
              // Create the item in player's inventory
              const daggerItem = game.items.getName(itemName);
              await actor.createEmbeddedDocuments('Item', [daggerItem]);
              const equippedDaggerItem = actor.items.getName(itemName);
              await equippedDaggerItem?.update({ 'system.attunement': CONFIG.DND5E.attunementTypes.ATTUNED, 'system.equipped': true });
            },
          },
        },
      },
      { width: 500 }
    ).render(true);
  }

  //------------------------
  // P R E C H E C K S
  //-----------
  const portal1 = Sequencer.EffectManager.getEffects({ name: portalId });
  if (portal1.length > 0) {
    ui.notifications.warn(`${portalName} already exist!`);
    return;
  }

  //------------------------
  // M A I N
  //-----------
  let portal1Coords;

  // ***
  // This block it's obsolete.
  // It can be removed after v11.5.1
  // ***
  if (info.macroPass === 'postActiveEffects') {
    ui.notifications.warn('Please update the item to the latest version by importing it from Boss Loot Compendium!');
    // Close the Actor Sheet
    await actor.sheet.close();
    const portal1Template = await warpgate.crosshairs.show(
      {
        interval: token.document.width % 2 === 0 ? 1 : -1,
        size: token.document.width,
        icon: item.img,
        label: '0 ft.',
      },
      {
        show: crosshairs => checkDistance(crosshairs, token, distanceAvailable, item.img),
      }
    );

    const crosshairsDistance = helpers.checkDistance(token, portal1Template);

    // Exit if
    if (portal1Template.cancelled || crosshairsDistance > distanceAvailable) {
      return;
    }

    portal1Coords = { x: portal1Template.x, y: portal1Template.y };
  } else {
    const myTemplate = game.canvas.templates.get(workflow.templateId);
    portal1Coords = { x: myTemplate?.document.x, y: myTemplate?.document.y };
    await myTemplate?.document.delete();
    // Check the distance
    const crosshairsDistance = helpers.checkDistance(token, myTemplate.document);
    if (crosshairsDistance > distanceAvailable) {
      ui.notifications.warn(`You can only use this ability up to ${distanceAvailable}ft!`);
      log(`You attempt to throw a knife to ${crosshairsDistance}ft but you can only use it up to max ${distanceAvailable}ft!`, itemNameNormalized, 'warn');
      return;
    }
  }

  const collision = helpers.testCollision(token.center, portal1Coords, { type: 'move', mode: 'any' });
  if (collision) {
    ui.notifications.warn('Cannot use the dagger through walls!');
    return;
  }

  game.PrimePortalDaggerHookClientSpecificId = Hooks.on('updateToken', async (tokenDoc, updateData) => {
    // Movement guard
    const inPortalRange = isPointInSquare(portal1Coords, tokenDoc);
    const portal2Position = Sequencer.EffectManager.getEffects({ name: nextPortalId });
    const portal1Position = Sequencer.EffectManager.getEffects({ name: portalId });
    if (inPortalRange && portal1Position.length === 1 && (!isNaN(updateData.x) || !isNaN(updateData.y))) {
      const isSameElevation = tokenDoc.elevation === helpers.getAnimationElevation(portal1Position[0]);
      if (!isSameElevation) {
        log(`${tokenDoc.name} is on the position of ${portalName} but on other elevation!`, itemNameNormalized);
        return;
      }
      if (tokenDoc.uuid === token.document.uuid) {
        await initiateDialog(tokenDoc, portal2Position);
      } else {
        await teleportToken(itemNameNormalized, nextPortalId, tokenDoc, portal2Position);
      }
    }
  });

  log(`Create the Hook "updateToken" with ID = ${game.PrimePortalDaggerHookClientSpecificId}`, itemNameNormalized);

  //------------------------
  // V I S U A L S
  //-----------
  await playVisuals(token, portal1Coords, itemNameNormalized, portalId, { hue: 345, saturate: 0, brightness: 1, contrast: 1 });

  await deleteItem(actor, itemName);
}

async function secundusItemAfterActiveEffects({ speaker, actor, token, character, item, args, scope, workflow }) {
  const itemName = helpers.getItemSource(item);
  const itemNameNormalized = helpers.normalizeItemName(itemName);
  const nextItemName = 'Tertius Portal Dagger';
  const portalName = 'Secundus Portal';
  const portalId = 'Secundus-Portal';
  const nextPortalId = 'Tertius-Portal';
  const info = args[0];
  const distanceAvailable = Math.max(item.system.range.value || 0, item.system.range.long || 0) || 60;
  const artWorkChatCardStatic = `modules/${MODULE_NAME}/artwork/006-portal-daggers/art-static-portal-dagger-secundus.webp`;
  const artWorkChatCardAnimated = `modules/${MODULE_NAME}/artwork/006-portal-daggers/art-animated-for-chat-portal-dagger-secundus.gif`;

  const abilitySelection = `<div class="dnd5e chat-card item-card midi-qol-item-card">
    <header class="card-header flexrow">
      <img src="${artWorkChatCardStatic}" title="${itemNameNormalized}" width="36" height="36" />
      <h3 class="item-name">${itemNameNormalized}</h3>
    </header>
    <div class="card-content">
      <p style="font-family: Arial; font-weight: ${CONST.FONT_WEIGHTS.Bold}">Do you want to enter in portal or pull the dagger and close the portal?</p>
      <br />
    </div>
    </div>`;

  await helpers.replaceChatArtwork(info.itemCardId, artWorkChatCardAnimated, artWorkChatCardStatic);

  // Locally because of the hook
  async function initiateDialog(tokenDoc, position) {
    await new Dialog(
      {
        title: 'Ability',
        content: abilitySelection,
        buttons: {
          button1: {
            icon: "<i class='fa-light fa-person-to-portal'></i>",
            label: 'Enter Portal',
            callback: async () => await teleportToken(itemNameNormalized, nextPortalId, tokenDoc, position),
          },
          button2: {
            icon: "<i class='fa-light fa-dagger'></i>",
            label: 'Pull the dagger',
            callback: async () => {
              /// HOOK OFF
              Hooks.off('updateToken', game.SecundusPortalDaggerHookClientSpecificId);
              log(`Deleted the Hook "updateToken" with ID = ${game.SecundusPortalDaggerHookClientSpecificId}`, itemNameNormalized);
              delete game.SecundusPortalDaggerHookClientSpecificId;

              await Sequencer.EffectManager.endEffects({ name: portalId });
              await Sequencer.EffectManager.endEffects({ name: itemNameNormalized });
              const message = `<p>With a firm grip, you grasp the hilt of the <strong>${itemNameNormalized}</strong> and give it a sharp tug. The blade easily slides out of the wall, the portal it had opened closing in an instant. The magical bond between the dagger and yourself remains, its power still pulsing within you. You secure the blade at your side, ready to use its power again in your journey.</p>`;
              await helpers.createChatMessage(itemNameNormalized, message, itemNameNormalized, artWorkChatCardStatic, artWorkChatCardAnimated);
              // Create the item in player's inventory
              const daggerItem = game.items.getName(itemName);
              await actor.createEmbeddedDocuments('Item', [daggerItem]);
              const equippedDaggerItem = actor.items.getName(itemName);
              await equippedDaggerItem?.update({ 'system.attunement': CONFIG.DND5E.attunementTypes.ATTUNED, 'system.equipped': true });
            },
          },
        },
      },
      { width: 500 }
    ).render(true);
  }

  //------------------------
  // P R E C H E C K S
  //-----------
  const portal1 = Sequencer.EffectManager.getEffects({ name: portalId });
  if (portal1.length > 0) {
    ui.notifications.warn(`${portalName} already exist!`);
    return;
  }

  //------------------------
  // M A I N
  //-----------
  let portal1Coords;

  // ***
  // This block it's obsolete.
  // It can be removed after v11.5.1
  // ***
  if (info.macroPass === 'postActiveEffects') {
    ui.notifications.warn('Please update the item to the latest version by importing it from Boss Loot Compendium!');
    // Close the Actor Sheet
    await actor.sheet.close();
    const portal1Template = await warpgate.crosshairs.show(
      {
        interval: token.document.width % 2 === 0 ? 1 : -1,
        size: token.document.width,
        icon: item.img,
        label: '0 ft.',
      },
      {
        show: crosshairs => checkDistance(crosshairs, token, distanceAvailable, item.img),
      }
    );

    const crosshairsDistance = helpers.checkDistance(token, portal1Template);

    // Exit if
    if (portal1Template.cancelled || crosshairsDistance > distanceAvailable) {
      return;
    }

    portal1Coords = { x: portal1Template.x, y: portal1Template.y };
  } else {
    const myTemplate = game.canvas.templates.get(workflow.templateId);
    portal1Coords = { x: myTemplate?.document.x, y: myTemplate?.document.y };
    await myTemplate?.document.delete();
    // Check the distance
    const crosshairsDistance = helpers.checkDistance(token, myTemplate.document);
    if (crosshairsDistance > distanceAvailable) {
      ui.notifications.warn(`You can only use this ability up to ${distanceAvailable}ft!`);
      log(`You attempt to throw a knife to ${crosshairsDistance}ft but you can only use it up to max ${distanceAvailable}ft!`, itemNameNormalized, 'warn');
      return;
    }
  }

  const collision = helpers.testCollision(token.center, portal1Coords, { type: 'move', mode: 'any' });
  if (collision) {
    ui.notifications.warn('Cannot use the dagger through walls!');
    return;
  }

  game.SecundusPortalDaggerHookClientSpecificId = Hooks.on('updateToken', async (tokenDoc, updateData) => {
    // Movement guard
    const inPortalRange = isPointInSquare(portal1Coords, tokenDoc);
    const portal2Position = Sequencer.EffectManager.getEffects({ name: nextPortalId });
    const portal1Position = Sequencer.EffectManager.getEffects({ name: portalId });
    if (inPortalRange && portal1Position.length === 1 && (!isNaN(updateData.x) || !isNaN(updateData.y))) {
      const isSameElevation = tokenDoc.elevation === helpers.getAnimationElevation(portal1Position[0]);
      if (!isSameElevation) {
        log(`${tokenDoc.name} is on the position of ${portalName} but on other elevation!`, itemNameNormalized);
        return;
      }
      if (tokenDoc.uuid === token.document.uuid) {
        await initiateDialog(tokenDoc, portal2Position);
      } else {
        await teleportToken(itemNameNormalized, nextPortalId, tokenDoc, portal2Position);
      }
    }
  });

  log(`Create the Hook "updateToken" with ID = ${game.SecundusPortalDaggerHookClientSpecificId}`, itemNameNormalized);

  //------------------------
  // V I S U A L S
  //-----------
  await playVisuals(token, portal1Coords, itemNameNormalized, portalId, { brightness: 1, contrast: 1, saturate: -2 });

  await deleteItem(actor, itemName);
}

async function tertiusItemAfterActiveEffects({ speaker, actor, token, character, item, args, scope, workflow }) {
  const itemName = helpers.getItemSource(item);
  const itemNameNormalized = helpers.normalizeItemName(itemName);
  const nextItemName = 'Quartus Portal Dagger';
  const portalName = 'Tertius Portal';
  const portalId = 'Tertius-Portal';
  const nextPortalId = 'Quartus-Portal';
  const info = args[0];
  const distanceAvailable = Math.max(item.system.range.value || 0, item.system.range.long || 0) || 60;
  const artWorkChatCardStatic = `modules/${MODULE_NAME}/artwork/006-portal-daggers/art-static-portal-dagger-tertius.webp`;
  const artWorkChatCardAnimated = `modules/${MODULE_NAME}/artwork/006-portal-daggers/art-animated-for-chat-portal-dagger-tertius.gif`;

  const abilitySelection = `<div class="dnd5e chat-card item-card midi-qol-item-card">
    <header class="card-header flexrow">
      <img src="${artWorkChatCardStatic}" title="${itemNameNormalized}" width="36" height="36" />
      <h3 class="item-name">${itemNameNormalized}</h3>
    </header>
    <div class="card-content">
      <p style="font-family: Arial; font-weight: ${CONST.FONT_WEIGHTS.Bold}">Do you want to enter in portal or pull the dagger and close the portal?</p>
      <br />
    </div>
    </div>`;

  await helpers.replaceChatArtwork(info.itemCardId, artWorkChatCardAnimated, artWorkChatCardStatic);

  // Locally because of the hook
  async function initiateDialog(tokenDoc, position) {
    await new Dialog(
      {
        title: 'Ability',
        content: abilitySelection,
        buttons: {
          button1: {
            icon: "<i class='fa-light fa-person-to-portal'></i>",
            label: 'Enter Portal',
            callback: async () => await teleportToken(itemNameNormalized, nextPortalId, tokenDoc, position),
          },
          button2: {
            icon: "<i class='fa-light fa-dagger'></i>",
            label: 'Pull the dagger',
            callback: async () => {
              /// HOOK OFF
              Hooks.off('updateToken', game.TertiusPortalDaggerHookClientSpecificId);
              log(`Deleted the Hook "updateToken" with ID = ${game.TertiusPortalDaggerHookClientSpecificId}`, itemNameNormalized);
              delete game.TertiusPortalDaggerHookClientSpecificId;

              await Sequencer.EffectManager.endEffects({ name: portalId });
              await Sequencer.EffectManager.endEffects({ name: itemNameNormalized });
              const message = `<p>With a firm grip, you grasp the hilt of the <strong>${itemNameNormalized}</strong> and give it a sharp tug. The blade easily slides out of the wall, the portal it had opened closing in an instant. The magical bond between the dagger and yourself remains, its power still pulsing within you. You secure the blade at your side, ready to use its power again in your journey.</p>`;
              await helpers.createChatMessage(itemNameNormalized, message, itemNameNormalized, artWorkChatCardStatic, artWorkChatCardAnimated);
              // Create the item in player's inventory
              const daggerItem = game.items.getName(itemName);
              await actor.createEmbeddedDocuments('Item', [daggerItem]);
              const equippedDaggerItem = actor.items.getName(itemName);
              await equippedDaggerItem?.update({ 'system.attunement': CONFIG.DND5E.attunementTypes.ATTUNED, 'system.equipped': true });
            },
          },
        },
      },
      { width: 500 }
    ).render(true);
  }

  //------------------------
  // P R E C H E C K S
  //-----------
  const portal1 = Sequencer.EffectManager.getEffects({ name: portalId });
  if (portal1.length > 0) {
    ui.notifications.warn(`${portalName} already exist!`);
    return;
  }

  //------------------------
  // M A I N
  //-----------
  let portal1Coords;

  // ***
  // This block it's obsolete.
  // It can be removed after v11.5.1
  // ***
  if (info.macroPass === 'postActiveEffects') {
    ui.notifications.warn('Please update the item to the latest version by importing it from Boss Loot Compendium!');
    // Close the Actor Sheet
    await actor.sheet.close();
    const portal1Template = await warpgate.crosshairs.show(
      {
        interval: token.document.width % 2 === 0 ? 1 : -1,
        size: token.document.width,
        icon: item.img,
        label: '0 ft.',
      },
      {
        show: crosshairs => checkDistance(crosshairs, token, distanceAvailable, item.img),
      }
    );

    const crosshairsDistance = helpers.checkDistance(token, portal1Template);

    // Exit if
    if (portal1Template.cancelled || crosshairsDistance > distanceAvailable) {
      return;
    }

    portal1Coords = { x: portal1Template.x, y: portal1Template.y };
  } else {
    const myTemplate = game.canvas.templates.get(workflow.templateId);
    portal1Coords = { x: myTemplate?.document.x, y: myTemplate?.document.y };
    await myTemplate?.document.delete();
    // Check the distance
    const crosshairsDistance = helpers.checkDistance(token, myTemplate.document);
    if (crosshairsDistance > distanceAvailable) {
      ui.notifications.warn(`You can only use this ability up to ${distanceAvailable}ft!`);
      log(`You attempt to throw a knife to ${crosshairsDistance}ft but you can only use it up to max ${distanceAvailable}ft!`, itemNameNormalized, 'warn');
      return;
    }
  }

  const collision = helpers.testCollision(token.center, portal1Coords, { type: 'move', mode: 'any' });
  if (collision) {
    ui.notifications.warn('Cannot use the dagger through walls!');
    return;
  }

  game.TertiusPortalDaggerHookClientSpecificId = Hooks.on('updateToken', async (tokenDoc, updateData) => {
    // Movement guard
    const inPortalRange = isPointInSquare(portal1Coords, tokenDoc);
    const portal2Position = Sequencer.EffectManager.getEffects({ name: nextPortalId });
    const portal1Position = Sequencer.EffectManager.getEffects({ name: portalId });
    if (inPortalRange && portal1Position.length === 1 && (!isNaN(updateData.x) || !isNaN(updateData.y))) {
      const isSameElevation = tokenDoc.elevation === helpers.getAnimationElevation(portal1Position[0]);
      if (!isSameElevation) {
        log(`${tokenDoc.name} is on the position of ${portalName} but on other elevation!`, itemNameNormalized);
        return;
      }
      if (tokenDoc.uuid === token.document.uuid) {
        await initiateDialog(tokenDoc, portal2Position);
      } else {
        await teleportToken(itemNameNormalized, nextPortalId, tokenDoc, portal2Position);
      }
    }
  });

  log(`Create the Hook "updateToken" with ID = ${game.TertiusPortalDaggerHookClientSpecificId}`, itemNameNormalized);

  //------------------------
  // V I S U A L S
  //-----------
  await playVisuals(token, portal1Coords, itemNameNormalized, portalId, { brightness: 1.5, contrast: 0, saturate: 0, hue: 55 });

  await deleteItem(actor, itemName);
}

async function quartusItemAfterActiveEffects({ speaker, actor, token, character, item, args, scope, workflow }) {
  const itemName = helpers.getItemSource(item);
  const itemNameNormalized = helpers.normalizeItemName(itemName);
  const nextItemName = 'Prime Portal Dagger';
  const portalName = 'Quartus Portal';
  const portalId = 'Quartus-Portal';
  const nextPortalId = 'Prime-Portal';
  const info = args[0];
  const distanceAvailable = Math.max(item.system.range.value || 0, item.system.range.long || 0) || 60;
  const artWorkChatCardStatic = `modules/${MODULE_NAME}/artwork/006-portal-daggers/art-static-portal-dagger-quartus.webp`;
  const artWorkChatCardAnimated = `modules/${MODULE_NAME}/artwork/006-portal-daggers/art-animated-for-chat-portal-dagger-quartus.gif`;

  const abilitySelection = `<div class="dnd5e chat-card item-card midi-qol-item-card">
    <header class="card-header flexrow">
      <img src="${artWorkChatCardStatic}" title="${itemNameNormalized}" width="36" height="36" />
      <h3 class="item-name">${itemNameNormalized}</h3>
    </header>
    <div class="card-content">
      <p style="font-family: Arial; font-weight: ${CONST.FONT_WEIGHTS.Bold}">Do you want to enter in portal or pull the dagger and close the portal?</p>
      <br />
    </div>
    </div>`;

  await helpers.replaceChatArtwork(info.itemCardId, artWorkChatCardAnimated, artWorkChatCardStatic);

  // Locally because of the hook
  async function initiateDialog(tokenDoc, position) {
    await new Dialog(
      {
        title: 'Ability',
        content: abilitySelection,
        buttons: {
          button1: {
            icon: "<i class='fa-light fa-person-to-portal'></i>",
            label: 'Enter Portal',
            callback: async () => await teleportToken(itemNameNormalized, nextPortalId, tokenDoc, position),
          },
          button2: {
            icon: "<i class='fa-light fa-dagger'></i>",
            label: 'Pull the dagger',
            callback: async () => {
              /// HOOK OFF
              Hooks.off('updateToken', game.QuartusPortalDaggerHookClientSpecificId);
              log(`Deleted the Hook "updateToken" with ID = ${game.QuartusPortalDaggerHookClientSpecificId}`, itemNameNormalized);
              delete game.QuartusPortalDaggerHookClientSpecificId;

              await Sequencer.EffectManager.endEffects({ name: portalId });
              await Sequencer.EffectManager.endEffects({ name: itemNameNormalized });
              const message = `<p>With a firm grip, you grasp the hilt of the <strong>${itemNameNormalized}</strong> and give it a sharp tug. The blade easily slides out of the wall, the portal it had opened closing in an instant. The magical bond between the dagger and yourself remains, its power still pulsing within you. You secure the blade at your side, ready to use its power again in your journey.</p>`;
              await helpers.createChatMessage(itemNameNormalized, message, itemNameNormalized, artWorkChatCardStatic, artWorkChatCardAnimated);
              // Create the item in player's inventory
              const daggerItem = game.items.getName(itemName);
              await actor.createEmbeddedDocuments('Item', [daggerItem]);
              const equippedDaggerItem = actor.items.getName(itemName);
              await equippedDaggerItem?.update({ 'system.attunement': CONFIG.DND5E.attunementTypes.ATTUNED, 'system.equipped': true });
            },
          },
        },
      },
      { width: 500 }
    ).render(true);
  }

  //------------------------
  // P R E C H E C K S
  //-----------
  const portal1 = Sequencer.EffectManager.getEffects({ name: portalId });
  if (portal1.length > 0) {
    ui.notifications.warn(`${portalName} already exist!`);
    return;
  }

  //------------------------
  // M A I N
  //-----------
  let portal1Coords;

  // ***
  // This block it's obsolete.
  // It can be removed after v11.5.1
  // ***
  if (info.macroPass === 'postActiveEffects') {
    ui.notifications.warn('Please update the item to the latest version by importing it from Boss Loot Compendium!');
    // Close the Actor Sheet
    await actor.sheet.close();
    const portal1Template = await warpgate.crosshairs.show(
      {
        interval: token.document.width % 2 === 0 ? 1 : -1,
        size: token.document.width,
        icon: item.img,
        label: '0 ft.',
      },
      {
        show: crosshairs => checkDistance(crosshairs, token, distanceAvailable, item.img),
      }
    );

    const crosshairsDistance = helpers.checkDistance(token, portal1Template);

    // Exit if
    if (portal1Template.cancelled || crosshairsDistance > distanceAvailable) {
      return;
    }

    portal1Coords = { x: portal1Template.x, y: portal1Template.y };
  } else {
    const myTemplate = game.canvas.templates.get(workflow.templateId);
    portal1Coords = { x: myTemplate?.document.x, y: myTemplate?.document.y };
    await myTemplate?.document.delete();
    // Check the distance
    const crosshairsDistance = helpers.checkDistance(token, myTemplate.document);
    if (crosshairsDistance > distanceAvailable) {
      ui.notifications.warn(`You can only use this ability up to ${distanceAvailable}ft!`);
      log(`You attempt to throw a knife to ${crosshairsDistance}ft but you can only use it up to max ${distanceAvailable}ft!`, itemNameNormalized, 'warn');
      return;
    }
  }

  const collision = helpers.testCollision(token.center, portal1Coords, { type: 'move', mode: 'any' });
  if (collision) {
    ui.notifications.warn('Cannot use the dagger through walls!');
    return;
  }

  game.QuartusPortalDaggerHookClientSpecificId = Hooks.on('updateToken', async (tokenDoc, updateData) => {
    // Movement guard
    const inPortalRange = isPointInSquare(portal1Coords, tokenDoc);
    const portal2Position = Sequencer.EffectManager.getEffects({ name: nextPortalId });
    const portal1Position = Sequencer.EffectManager.getEffects({ name: portalId });
    if (inPortalRange && portal1Position.length === 1 && (!isNaN(updateData.x) || !isNaN(updateData.y))) {
      const isSameElevation = tokenDoc.elevation === helpers.getAnimationElevation(portal1Position[0]);
      if (!isSameElevation) {
        log(`${tokenDoc.name} is on the position of ${portalName} but on other elevation!`, itemNameNormalized);
        return;
      }
      if (tokenDoc.uuid === token.document.uuid) {
        await initiateDialog(tokenDoc, portal2Position);
      } else {
        await teleportToken(itemNameNormalized, nextPortalId, tokenDoc, portal2Position);
      }
    }
  });

  log(`Create the Hook "updateToken" with ID = ${game.QuartusPortalDaggerHookClientSpecificId}`, itemNameNormalized);

  //------------------------
  // V I S U A L S
  //-----------
  await playVisuals(token, portal1Coords, itemNameNormalized, portalId, { brightness: 1, contrast: 1, saturate: 0, hue: 230 });

  await deleteItem(actor, itemName);
}

async function primeEffectOnOff({ speaker, actor, token, character, args, item, scope }) {
  const featName = 'Prime Portal (Active Ability)';
  if (args[0] === 'on') {
    if (!item) {
      log('Cannot fetch the source item!', '', 'warn');
      return;
    }

    const featExists = actor.items.some(item => item.name === featName && item.type === 'feat');

    if (featExists) {
      log(`A feature with name ${featName} already exists`);
      return;
    }

    const itemNameNormalized = helpers.normalizeItemName(item.name);
    const nextItemNameNormalized = 'Secundus';

    const featDesc = `<p>As you grip the hilt of the <strong>${itemNameNormalized}</strong>, you feel its magical energy coursing through your veins. With a flick of the wrist, you throw the blade towards the wall before you. The air shimmers and ripples, as if it were a pool of water disturbed by a stone. Suddenly, a circular portal opens before you, leading to the location of the <strong>${nextItemNameNormalized}</strong> knife. You feel a powerful bond being formed between the dagger and yourself, assuring that only you can retrieve the blade from its resting place. No matter where the <strong>${nextItemNameNormalized}</strong> knife may be, the <strong>${itemNameNormalized}</strong> serves as a guide, unlocking the path to your next destination.</p>`;

    const primePortalfeat = foundry.utils.deepClone(portalDaggersAbility.primePortalfeat);

    // Customize the Active Ability
    primePortalfeat.system.source = item.name;
    primePortalfeat.system.description.value = featDesc;
    primePortalfeat.flags['midi-qol'].onUseMacroName = '[postTemplatePlaced]function.bossLoot.macros.portalDaggersFeat.primeItemAAE';

    await actor.createEmbeddedDocuments('Item', [primePortalfeat]);
  }
  if (args[0] === 'off') {
    let myItems = actor.items;

    // Get the IDs of items to be removed
    const itemsToRemove = myItems.filter(item => item.name === featName && item.type === 'feat').map(item => item.id);

    // Remove the items
    if (itemsToRemove.length > 0) {
      log(`Deleting feat ${featName}`);
      await actor.deleteEmbeddedDocuments('Item', itemsToRemove);
    }
  }
}

async function secundusEffectOnOff({ speaker, actor, token, character, args, item, scope }) {
  const featName = 'Secundus Portal (Active Ability)';
  if (args[0] === 'on') {
    if (!item) {
      log('Cannot fetch the source item!', '', 'warn');
      return;
    }

    const featExists = actor.items.some(item => item.name === featName && item.type === 'feat');

    if (featExists) {
      log(`A feature with name ${featName} already exists`);
      return;
    }

    const itemNameNormalized = helpers.normalizeItemName(item.name);
    const nextItemNameNormalized = 'Tertius';

    const featDesc = `<p>As you grip the hilt of the <strong>${itemNameNormalized}</strong>, you feel its magical energy coursing through your veins. With a flick of the wrist, you throw the blade towards the wall before you. The air shimmers and ripples, as if it were a pool of water disturbed by a stone. Suddenly, a circular portal opens before you, leading to the location of the <strong>${nextItemNameNormalized}</strong> knife. You feel a powerful bond being formed between the dagger and yourself, assuring that only you can retrieve the blade from its resting place. No matter where the <strong>${nextItemNameNormalized}</strong> knife may be, the <strong>${itemNameNormalized}</strong> serves as a guide, unlocking the path to your next destination.</p>`;

    const secundusPortalfeat = foundry.utils.deepClone(portalDaggersAbility.secundusPortalfeat);

    // Customize the Active Ability
    secundusPortalfeat.system.source = item.name;
    secundusPortalfeat.system.description.value = featDesc;
    secundusPortalfeat.flags['midi-qol'].onUseMacroName = '[postTemplatePlaced]function.bossLoot.macros.portalDaggersFeat.secundusItemAAE';

    await actor.createEmbeddedDocuments('Item', [secundusPortalfeat]);
  }
  if (args[0] === 'off') {
    let myItems = actor.items;

    // Get the IDs of items to be removed
    const itemsToRemove = myItems.filter(item => item.name === featName && item.type === 'feat').map(item => item.id);

    // Remove the items
    if (itemsToRemove.length > 0) {
      log(`Deleting feat ${featName}`);
      await actor.deleteEmbeddedDocuments('Item', itemsToRemove);
    }
  }
}
async function tertiusEffectOnOff({ speaker, actor, token, character, args, item, scope }) {
  const featName = 'Tertius Portal (Active Ability)';
  if (args[0] === 'on') {
    if (!item) {
      log('Cannot fetch the source item!', '', 'warn');
      return;
    }

    const featExists = actor.items.some(item => item.name === featName && item.type === 'feat');

    if (featExists) {
      log(`A feature with name ${featName} already exists`);
      return;
    }

    const itemNameNormalized = helpers.normalizeItemName(item.name);
    const nextItemNameNormalized = 'Quartus';

    const featDesc = `<p>As you grip the hilt of the <strong>${itemNameNormalized}</strong>, you feel its magical energy coursing through your veins. With a flick of the wrist, you throw the blade towards the wall before you. The air shimmers and ripples, as if it were a pool of water disturbed by a stone. Suddenly, a circular portal opens before you, leading to the location of the <strong>${nextItemNameNormalized}</strong> knife. You feel a powerful bond being formed between the dagger and yourself, assuring that only you can retrieve the blade from its resting place. No matter where the <strong>${nextItemNameNormalized}</strong> knife may be, the <strong>${itemNameNormalized}</strong> serves as a guide, unlocking the path to your next destination.</p>`;

    const tertiusPortalfeat = foundry.utils.deepClone(portalDaggersAbility.tertiusPortalfeat);

    // Customize the Active Ability
    tertiusPortalfeat.system.source = item.name;
    tertiusPortalfeat.system.description.value = featDesc;
    tertiusPortalfeat.flags['midi-qol'].onUseMacroName = '[postTemplatePlaced]function.bossLoot.macros.portalDaggersFeat.tertiusItemAAE';

    await actor.createEmbeddedDocuments('Item', [tertiusPortalfeat]);
  }

  if (args[0] === 'off') {
    let myItems = actor.items;

    // Get the IDs of items to be removed
    const itemsToRemove = myItems.filter(item => item.name === featName && item.type === 'feat').map(item => item.id);

    // Remove the items
    if (itemsToRemove.length > 0) {
      log(`Deleting feat ${featName}`);
      await actor.deleteEmbeddedDocuments('Item', itemsToRemove);
    }
  }
}

async function quartusEffectOnOff({ speaker, actor, token, character, args, item, scope }) {
  const featName = 'Quartus Portal (Active Ability)';
  if (args[0] === 'on') {
    if (!item) {
      log('Cannot fetch the source item!', '', 'warn');
      return;
    }

    const featExists = actor.items.some(item => item.name === featName && item.type === 'feat');

    if (featExists) {
      log(`A feature with name ${featName} already exists`);
      return;
    }

    const itemNameNormalized = helpers.normalizeItemName(item.name);
    const nextItemNameNormalized = 'Prime';

    const featDesc = `<p>As you grip the hilt of the <strong>${itemNameNormalized}</strong>, you feel its magical energy coursing through your veins. With a flick of the wrist, you throw the blade towards the wall before you. The air shimmers and ripples, as if it were a pool of water disturbed by a stone. Suddenly, a circular portal opens before you, leading to the location of the <strong>${nextItemNameNormalized}</strong> knife. You feel a powerful bond being formed between the dagger and yourself, assuring that only you can retrieve the blade from its resting place. No matter where the <strong>${nextItemNameNormalized}</strong> knife may be, the <strong>${itemNameNormalized}</strong> serves as a guide, unlocking the path to your next destination.</p>`;

    const quartusPortalfeat = foundry.utils.deepClone(portalDaggersAbility.quartusPortalfeat);

    // Customize the Active Ability
    quartusPortalfeat.system.source = item.name;
    quartusPortalfeat.system.description.value = featDesc;
    quartusPortalfeat.flags['midi-qol'].onUseMacroName = '[postTemplatePlaced]function.bossLoot.macros.portalDaggersFeat.quartusItemAAE';

    await actor.createEmbeddedDocuments('Item', [quartusPortalfeat]);
  }
  if (args[0] === 'off') {
    let myItems = actor.items;

    // Get the IDs of items to be removed
    const itemsToRemove = myItems.filter(item => item.name === featName && item.type === 'feat').map(item => item.id);

    // Remove the items
    if (itemsToRemove.length > 0) {
      log(`Deleting feat ${featName}`);
      await actor.deleteEmbeddedDocuments('Item', itemsToRemove);
    }
  }
}

export const portalDaggersFeat = {
  primeItemAAE: primeItemAfterActiveEffects,
  secundusItemAAE: secundusItemAfterActiveEffects,
  tertiusItemAAE: tertiusItemAfterActiveEffects,
  quartusItemAAE: quartusItemAfterActiveEffects,
  primeEffectOnOff: primeEffectOnOff,
  secundusEffectOnOff: secundusEffectOnOff,
  tertiusEffectOnOff: tertiusEffectOnOff,
  quartusEffectOnOff: quartusEffectOnOff,
};
