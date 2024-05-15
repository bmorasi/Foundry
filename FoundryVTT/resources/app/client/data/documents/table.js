/**
 * @typedef {Object} RollTableDraw      An object containing the executed Roll and the produced results
 * @property {Roll} roll                The Dice roll which generated the draw
 * @property {TableResult[]} results    An array of drawn TableResult documents
 */

/**
 * The client-side RollTable document which extends the common BaseRollTable model.
 * @extends documents.BaseRollTable
 * @mixes ClientDocumentMixin
 *
 * @see {@link RollTables}                      The world-level collection of RollTable documents
 * @see {@link TableResult}                     The embedded TableResult document
 * @see {@link RollTableConfig}                 The RollTable configuration application
 */
class RollTable extends ClientDocumentMixin(foundry.documents.BaseRollTable) {

  /**
   * Provide a thumbnail image path used to represent this document.
   * @type {string}
   */
  get thumbnail() {
    return this.img;
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Display a result drawn from a RollTable in the Chat Log along.
   * Optionally also display the Roll which produced the result and configure aspects of the displayed messages.
   *
   * @param {TableResult[]} results         An Array of one or more TableResult Documents which were drawn and should
   *                                        be displayed.
   * @param {object} [options={}]           Additional options which modify message creation
   * @param {Roll} [options.roll]                 An optional Roll instance which produced the drawn results
   * @param {Object} [options.messageData={}]     Additional data which customizes the created messages
   * @param {Object} [options.messageOptions={}]  Additional options which customize the created messages
   */
  async toMessage(results, {roll=null, messageData={}, messageOptions={}}={}) {
    const speaker = ChatMessage.getSpeaker();

    // Construct chat data
    const flavorKey = `TABLE.DrawFlavor${results.length > 1 ? "Plural" : ""}`;
    messageData = foundry.utils.mergeObject({
      flavor: game.i18n.format(flavorKey, {number: results.length, name: this.name}),
      user: game.user.id,
      speaker: speaker,
      type: roll ? CONST.CHAT_MESSAGE_TYPES.ROLL : CONST.CHAT_MESSAGE_TYPES.OTHER,
      roll: roll,
      sound: roll ? CONFIG.sounds.dice : null,
      flags: {"core.RollTable": this.id}
    }, messageData);

    // Render the chat card which combines the dice roll with the drawn results
    messageData.content = await renderTemplate(CONFIG.RollTable.resultTemplate, {
      description: await TextEditor.enrichHTML(this.description, {documents: true, async: true}),
      results: results.map(result => {
        const r = result.toObject(false);
        r.text = result.getChatText();
        r.icon = result.icon;
        return r;
      }),
      rollHTML: this.displayRoll && roll ? await roll.render() : null,
      table: this
    });

    // Create the chat message
    return ChatMessage.implementation.create(messageData, messageOptions);
  }

  /* -------------------------------------------- */

  /**
   * Draw a result from the RollTable based on the table formula or a provided Roll instance
   * @param {object} [options={}]         Optional arguments which customize the draw behavior
   * @param {Roll} [options.roll]                   An existing Roll instance to use for drawing from the table
   * @param {boolean} [options.recursive=true]      Allow drawing recursively from inner RollTable results
   * @param {TableResult[]} [options.results]       One or more table results which have been drawn
   * @param {boolean} [options.displayChat=true]    Whether to automatically display the results in chat
   * @param {string} [options.rollMode]             The chat roll mode to use when displaying the result
   * @returns {Promise<{RollTableDraw}>}  A Promise which resolves to an object containing the executed roll and the
   *                                      produced results.
   */
  async draw({roll, recursive=true, results=[], displayChat=true, rollMode}={}) {

    // If an array of results were not already provided, obtain them from the standard roll method
    if ( !results.length ) {
      const r = await this.roll({roll, recursive});
      roll = r.roll;
      results = r.results;
    }
    if ( !results.length ) return { roll, results };

    // Mark results as drawn, if replacement is not used, and we are not in a Compendium pack
    if ( !this.replacement && !this.pack) {
      const draws = this.getResultsForRoll(roll.total);
      await this.updateEmbeddedDocuments("TableResult", draws.map(r => {
        return {_id: r.id, drawn: true};
      }));
    }

    // Mark any nested table results as drawn too.
    let updates = results.reduce((obj, r) => {
      const parent = r.parent;
      if ( (parent === this) || parent.replacement || parent.pack ) return obj;
      if ( !obj[parent.id] ) obj[parent.id] = [];
      obj[parent.id].push({_id: r.id, drawn: true});
      return obj;
    }, {});

    if ( Object.keys(updates).length ) {
      updates = Object.entries(updates).map(([id, results]) => {
        return {_id: id, results};
      });
      await RollTable.implementation.updateDocuments(updates);
    }

    // Forward drawn results to create chat messages
    if ( displayChat ) {
      await this.toMessage(results, {
        roll: roll,
        messageOptions: {rollMode}
      });
    }

    // Return the roll and the produced results
    return {roll, results};
  }

  /* -------------------------------------------- */

  /**
   * Draw multiple results from a RollTable, constructing a final synthetic Roll as a dice pool of inner rolls.
   * @param {number} number               The number of results to draw
   * @param {object} [options={}]         Optional arguments which customize the draw
   * @param {Roll} [options.roll]                   An optional pre-configured Roll instance which defines the dice
   *                                                roll to use
   * @param {boolean} [options.recursive=true]      Allow drawing recursively from inner RollTable results
   * @param {boolean} [options.displayChat=true]    Automatically display the drawn results in chat? Default is true
   * @param {string} [options.rollMode]             Customize the roll mode used to display the drawn results
   * @returns {Promise<{RollTableDraw}>}  The drawn results
   */
  async drawMany(number, {roll=null, recursive=true, displayChat=true, rollMode}={}) {
    let results = [];
    let updates = [];
    const rolls = [];

    // Roll the requested number of times, marking results as drawn
    for ( let n=0; n<number; n++ ) {
      let draw = await this.roll({roll, recursive});
      if ( draw.results.length ) {
        rolls.push(draw.roll);
        results = results.concat(draw.results);
      }
      else break;

      // Mark results as drawn, if replacement is not used, and we are not in a Compendium pack
      if ( !this.replacement && !this.pack) {
        updates = updates.concat(draw.results.map(r => {
          r.drawn = true;
          return {_id: r.id, drawn: true};
        }));
      }
    }

    // Construct a Roll object using the constructed pool
    const pool = PoolTerm.fromRolls(rolls);
    roll = Roll.defaultImplementation.fromTerms([pool]);

    // Commit updates to child results
    if ( updates.length ) {
      await this.updateEmbeddedDocuments("TableResult", updates, {diff: false});
    }

    // Forward drawn results to create chat messages
    if ( displayChat && results.length ) {
      await this.toMessage(results, {
        roll: roll,
        messageOptions: {rollMode}
      });
    }

    // Return the Roll and the array of results
    return {roll, results};
  }

  /* -------------------------------------------- */

  /**
   * Normalize the probabilities of rolling each item in the RollTable based on their assigned weights
   * @returns {Promise<RollTable>}
   */
  async normalize() {
    let totalWeight = 0;
    let counter = 1;
    const updates = [];
    for ( let result of this.results ) {
      const w = result.weight ?? 1;
      totalWeight += w;
      updates.push({_id: result.id, range: [counter, counter + w - 1]});
      counter = counter + w;
    }
    return this.update({results: updates, formula: `1d${totalWeight}`});
  }

  /* -------------------------------------------- */

  /**
   * Reset the state of the RollTable to return any drawn items to the table
   * @returns {Promise<RollTable>}
   */
  async resetResults() {
    const updates = this.results.map(result => ({_id: result.id, drawn: false}));
    return this.updateEmbeddedDocuments("TableResult", updates, {diff: false});
  }

  /* -------------------------------------------- */

  /**
   * Evaluate a RollTable by rolling its formula and retrieving a drawn result.
   *
   * Note that this function only performs the roll and identifies the result, the RollTable#draw function should be
   * called to formalize the draw from the table.
   *
   * @param {object} [options={}]       Options which modify rolling behavior
   * @param {Roll} [options.roll]                   An alternative dice Roll to use instead of the default table formula
   * @param {boolean} [options.recursive=true]   If a RollTable document is drawn as a result, recursively roll it
   * @param {number} [options._depth]            An internal flag used to track recursion depth
   * @returns {Promise<RollTableDraw>}  The Roll and results drawn by that Roll
   *
   * @example Draw results using the default table formula
   * ```js
   * const defaultResults = await table.roll();
   * ```
   *
   * @example Draw results using a custom roll formula
   * ```js
   * const roll = new Roll("1d20 + @abilities.wis.mod", actor.getRollData());
   * const customResults = await table.roll({roll});
   * ```
   */
  async roll({roll, recursive=true, _depth=0}={}) {

    // Prevent excessive recursion
    if ( _depth > 5 ) {
      throw new Error(`Maximum recursion depth exceeded when attempting to draw from RollTable ${this.id}`);
    }

    // If there is no formula, automatically calculate an even distribution
    if ( !this.formula ) {
      await this.normalize();
    }

    // Reference the provided roll formula
    roll = roll instanceof Roll ? roll : Roll.create(this.formula);
    let results = [];

    // Ensure that at least one non-drawn result remains
    const available = this.results.filter(r => !r.drawn);
    if ( !available.length ) {
      ui.notifications.warn(game.i18n.localize("TABLE.NoAvailableResults"));
      return {roll, results};
    }

    // Ensure that results are available within the minimum/maximum range
    const minRoll = (await roll.reroll({minimize: true, async: true})).total;
    const maxRoll = (await roll.reroll({maximize: true, async: true})).total;
    const availableRange = available.reduce((range, result) => {
      const r = result.range;
      if ( !range[0] || (r[0] < range[0]) ) range[0] = r[0];
      if ( !range[1] || (r[1] > range[1]) ) range[1] = r[1];
      return range;
    }, [null, null]);
    if ( (availableRange[0] > maxRoll) || (availableRange[1] < minRoll) ) {
      ui.notifications.warn("No results can possibly be drawn from this table and formula.");
      return {roll, results};
    }

    // Continue rolling until one or more results are recovered
    let iter = 0;
    while ( !results.length ) {
      if ( iter >= 10000 ) {
        ui.notifications.error(`Failed to draw an available entry from Table ${this.name}, maximum iteration reached`);
        break;
      }
      roll = await roll.reroll({async: true});
      results = this.getResultsForRoll(roll.total);
      iter++;
    }

    // Draw results recursively from any inner Roll Tables
    if ( recursive ) {
      let inner = [];
      for ( let result of results ) {
        let pack;
        let documentName;
        if ( result.type === CONST.TABLE_RESULT_TYPES.DOCUMENT ) documentName = result.documentCollection;
        else if ( result.type === CONST.TABLE_RESULT_TYPES.COMPENDIUM ) {
          pack = game.packs.get(result.documentCollection);
          documentName = pack?.documentName;
        }
        if ( documentName === "RollTable" ) {
          const id = result.documentId;
          const innerTable = pack ? await pack.getDocument(id) : game.tables.get(id);
          if (innerTable) {
            const innerRoll = await innerTable.roll({_depth: _depth + 1});
            inner = inner.concat(innerRoll.results);
          }
        }
        else inner.push(result);
      }
      results = inner;
    }

    // Return the Roll and the results
    return { roll, results };
  }

  /* -------------------------------------------- */

  /**
   * Get an Array of valid results for a given rolled total
   * @param {number} value    The rolled value
   * @returns {TableResult[]} An Array of results
   */
  getResultsForRoll(value) {
    return this.results.filter(r => !r.drawn && Number.between(value, ...r.range));
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
    super._onCreateDescendantDocuments(parent, collection, documents, data, options, userId);
    if ( options.render !== false ) this.collection.render();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId) {
    super._onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId);
    if ( options.render !== false ) this.collection.render();
  }

  /* -------------------------------------------- */
  /*  Importing and Exporting                     */
  /* -------------------------------------------- */

  /** @override */
  toCompendium(pack, options={}) {
    const data = super.toCompendium(pack, options);
    if ( options.clearState ) {
      for ( let r of data.results ) {
        r.drawn = false;
      }
    }
    return data;
  }

  /* -------------------------------------------- */

  /**
   * Create a new RollTable document using all of the Documents from a specific Folder as new results.
   * @param {Folder} folder       The Folder document from which to create a roll table
   * @param {object} options      Additional options passed to the RollTable.create method
   * @returns {Promise<RollTable>}
   */
  static async fromFolder(folder, options={}) {
    const results = folder.contents.map((e, i) => {
      return {
        text: e.name,
        type: folder.pack ? CONST.TABLE_RESULT_TYPES.COMPENDIUM : CONST.TABLE_RESULT_TYPES.DOCUMENT,
        documentCollection: folder.pack ? folder.pack : folder.type,
        documentId: e.id,
        img: e.thumbnail || e.img,
        weight: 1,
        range: [i+1, i+1],
        drawn: false
      };
    });
    options.renderSheet = options.renderSheet ?? true;
    return this.create({
      name: folder.name,
      description: `A random table created from the contents of the ${folder.name} Folder.`,
      results: results,
      formula: `1d${results.length}`
    }, options);
  }
}
