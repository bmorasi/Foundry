var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};
var __accessCheck = (obj, member, msg) => {
  if (!member.has(obj))
    throw TypeError("Cannot " + msg);
};
var __privateAdd = (obj, member, value) => {
  if (member.has(obj))
    throw TypeError("Cannot add the same private member more than once");
  member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
};
var __privateMethod = (obj, member, method) => {
  __accessCheck(obj, member, "access private method");
  return method;
};
var _appendSceneTransitionsElement, appendSceneTransitionsElement_fn, _appendBackgroundElement, appendBackgroundElement_fn, _appendVideoBackgroundElement, appendVideoBackgroundElement_fn, _appendStaticBackgroundElement, appendStaticBackgroundElement_fn, _appendContentElement, appendContentElement_fn, _addOnClick, addOnClick_fn, _playAudio, playAudio_fn, _executeFadeIn, executeFadeIn_fn;
const CONSTANTS = {
  MODULE_ID: "scene-transitions",
  PATH: "modules/scene-transitions/",
  SETTINGS: {
    DEBUG: "debug",
    SHOW_JOURNAL_HEADER: "show-journal-header-transition",
    RESET: "resetAllSettings"
  }
};
function stripQueryStringAndHashFromPath(url) {
  let myUrl = url;
  if (!myUrl) {
    return myUrl;
  }
  if (myUrl.includes("?")) {
    myUrl = myUrl.split("?")[0];
  }
  if (myUrl.includes("#")) {
    myUrl = myUrl.split("#")[0];
  }
  return myUrl;
}
__name(stripQueryStringAndHashFromPath, "stripQueryStringAndHashFromPath");
function retrieveFirstImageFromJournalId(id, pageId, noDefault) {
  const journalEntry = game.journal.get(id);
  let firstImage = void 0;
  if (!journalEntry) {
    return firstImage;
  }
  if (journalEntry?.pages.size > 0) {
    const sortedArray = journalEntry.pages.contents.sort((a, b) => a.sort - b.sort);
    if (pageId) {
      const pageSelected = sortedArray.find((page) => page.id === pageId);
      if (pageSelected) {
        if (pageSelected.type === "image" && pageSelected.src) {
          firstImage = stripQueryStringAndHashFromPath(pageSelected.src);
        } else if (pageSelected.src) {
          firstImage = stripQueryStringAndHashFromPath(pageSelected.src);
        }
      }
    }
    if (!noDefault && !firstImage) {
      for (const pageEntry of sortedArray) {
        if (pageEntry.type === "image" && pageEntry.src) {
          firstImage = stripQueryStringAndHashFromPath(pageEntry.src);
          break;
        } else if (pageEntry.src && pageEntry.type === "pdf") {
          firstImage = stripQueryStringAndHashFromPath(pageEntry.src);
          break;
        } else if (pageEntry.src) {
          firstImage = stripQueryStringAndHashFromPath(pageEntry.src);
          break;
        }
      }
    }
  }
  return firstImage;
}
__name(retrieveFirstImageFromJournalId, "retrieveFirstImageFromJournalId");
function retrieveFirstTextFromJournalId(id, pageId, noDefault) {
  const journalEntry = game.journal.get(id);
  let firstText = void 0;
  if (!journalEntry) {
    return firstText;
  }
  if (journalEntry?.pages.size > 0) {
    const sortedArray = journalEntry.pages.contents.sort((a, b) => a.sort - b.sort);
    if (pageId) {
      const pageSelected = sortedArray.find((page) => page.id === pageId);
      if (pageSelected) {
        if (pageSelected.type === "text" && pageSelected.text?.content) {
          firstText = pageSelected.text?.content;
        } else if (pageSelected.text?.content) {
          firstText = pageSelected.text?.content;
        }
      }
    }
    if (!noDefault && !firstText) {
      for (const journalEntry2 of sortedArray) {
        if (journalEntry2.type === "text" && journalEntry2.text?.content) {
          firstText = journalEntry2.text?.content;
          break;
        } else if (journalEntry2.text?.content) {
          firstText = journalEntry2.text?.content;
          break;
        }
      }
    }
  }
  return firstText;
}
__name(retrieveFirstTextFromJournalId, "retrieveFirstTextFromJournalId");
const _SceneTransitionOptions = class _SceneTransitionOptions {
  constructor(options) {
    this.action = options.action || "";
    this.sceneID = options.sceneID || "";
    this.gmHide = isBoolean(options.gmHide) ? options.gmHide : false;
    this.fontColor = options.fontColor || "#777777";
    this.fontSize = options.fontSize || "28px";
    this.bgImg = options.bgImg || "";
    this.bgPos = options.bgPos || "center center";
    this.bgLoop = isBoolean(options.bgLoop) ? options.bgLoop : false;
    this.bgMuted = isBoolean(options.bgMuted) ? options.bgMuted : true;
    this.bgSize = options.bgSize || "cover";
    this.bgColor = options.bgColor || "#000000";
    this.bgOpacity = options.bgOpacity || 0.7;
    this.fadeIn = options.fadeIn || 400;
    this.delay = options.delay || 4e3;
    this.fadeOut = options.fadeOut || 1e3;
    this.volume = options.volume || 1;
    this.audioLoop = isBoolean(options.audioLoop) ? options.audioLoop : true;
    this.skippable = isBoolean(options.skippable) ? options.skippable : true;
    this.gmEndAll = isBoolean(options.gmEndAll) ? options.gmEndAll : true;
    this.showUI = isBoolean(options.showUI) ? options.showUI : false;
    this.activateScene = isBoolean(options.activateScene) ? options.activateScene : false;
    this.content = options.content || "";
    this.audio = options.audio || "";
    this.fromSocket = isBoolean(options.fromSocket) ? options.fromSocket : false;
    this.users = options.users || [];
  }
};
__name(_SceneTransitionOptions, "SceneTransitionOptions");
let SceneTransitionOptions = _SceneTransitionOptions;
function isBoolean(value) {
  if (String(value) === "true" || String(value) === "false") {
    return true;
  } else {
    return false;
  }
}
__name(isBoolean, "isBoolean");
function isVideo(imgSrc) {
  const re = /(?:\.([^.]+))?$/;
  const ext = re.exec(imgSrc)?.[1];
  return ext === "webm" || ext === "mp4";
}
__name(isVideo, "isVideo");
function getVideoType(imgSrc) {
  if (imgSrc.endsWith("webm")) {
    return "video/webm";
  } else if (imgSrc.endsWith("mp4")) {
    return "video/mp4";
  }
  return "video/mp4";
}
__name(getVideoType, "getVideoType");
const registerSettings = /* @__PURE__ */ __name(function() {
  game.settings.registerMenu(CONSTANTS.MODULE_ID, CONSTANTS.SETTINGS.RESET, {
    name: `${CONSTANTS.MODULE_ID}.setting.${CONSTANTS.SETTINGS.RESET}.name`,
    hint: `${CONSTANTS.MODULE_ID}.setting.${CONSTANTS.SETTINGS.RESET}.hint`,
    icon: "fas fa-coins",
    type: ResetSettingsDialog,
    restricted: true
  });
  game.settings.register(CONSTANTS.MODULE_ID, CONSTANTS.SETTINGS.SHOW_JOURNAL_HEADER, {
    name: `${CONSTANTS.MODULE_ID}.setting.${CONSTANTS.SETTINGS.SHOW_JOURNAL_HEADER}.name`,
    hint: `${CONSTANTS.MODULE_ID}.setting.${CONSTANTS.SETTINGS.SHOW_JOURNAL_HEADER}.hint`,
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
  game.settings.register(CONSTANTS.MODULE_ID, CONSTANTS.SETTINGS.DEBUG, {
    name: `${CONSTANTS.MODULE_ID}.setting.${CONSTANTS.SETTINGS.DEBUG}.name`,
    hint: `${CONSTANTS.MODULE_ID}.setting.${CONSTANTS.SETTINGS.DEBUG}.hint`,
    scope: "client",
    config: true,
    default: false,
    type: Boolean
  });
  const settings = defaultSettings();
  for (const [name, data] of Object.entries(settings)) {
    game.settings.register(CONSTANTS.MODULE_ID, name, data);
  }
}, "registerSettings");
const _ResetSettingsDialog = class _ResetSettingsDialog extends FormApplication {
  constructor(...args) {
    super(...args);
    return new Dialog({
      title: game.i18n.localize(`${CONSTANTS.MODULE_ID}.dialogs.resetsettings.title`),
      content: '<p style="margin-bottom:1rem;">' + game.i18n.localize(`${CONSTANTS.MODULE_ID}.dialogs.resetsettings.content`) + "</p>",
      buttons: {
        confirm: {
          icon: '<i class="fas fa-check"></i>',
          label: game.i18n.localize(`${CONSTANTS.MODULE_ID}.dialogs.resetsettings.confirm`),
          callback: async () => {
            await applyDefaultSettings();
            window.location.reload();
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: game.i18n.localize(`${CONSTANTS.MODULE_ID}.dialogs.resetsettings.cancel`)
        }
      },
      default: "cancel"
    });
  }
  async _updateObject(event, formData) {
  }
};
__name(_ResetSettingsDialog, "ResetSettingsDialog");
let ResetSettingsDialog = _ResetSettingsDialog;
async function applyDefaultSettings() {
  const settings2 = otherSettings(true);
  for (const [settingName, settingValue] of Object.entries(settings2)) {
    await game.settings.set(CONSTANTS.MODULE_ID, settingName, settingValue.default);
  }
}
__name(applyDefaultSettings, "applyDefaultSettings");
function defaultSettings(apply = false) {
  return {
    //
  };
}
__name(defaultSettings, "defaultSettings");
function otherSettings(apply = false) {
  return {
    "show-journal-header-transition": {
      name: `${CONSTANTS.MODULE_ID}.setting.${CONSTANTS.SETTINGS.SHOW_JOURNAL_HEADER}.name`,
      hint: `${CONSTANTS.MODULE_ID}.setting.${CONSTANTS.SETTINGS.SHOW_JOURNAL_HEADER}.hint`,
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    },
    debug: {
      name: `${CONSTANTS.MODULE_ID}.setting.${CONSTANTS.SETTINGS.DEBUG}.name`,
      hint: `${CONSTANTS.MODULE_ID}.setting.${CONSTANTS.SETTINGS.DEBUG}.hint`,
      scope: "client",
      config: true,
      default: false,
      type: Boolean
    }
  };
}
__name(otherSettings, "otherSettings");
const _Logger = class _Logger {
  static get DEBUG() {
    return game.settings.get(CONSTANTS.MODULE_ID, "debug") || game.modules.get("_dev-mode")?.api?.getPackageDebugValue(CONSTANTS.MODULE_ID, "boolean");
  }
  // export let debugEnabled = 0;
  // 0 = none, warnings = 1, debug = 2, all = 3
  static debug(msg, ...args) {
    try {
      if (game.settings.get(CONSTANTS.MODULE_ID, "debug") || game.modules.get("_dev-mode")?.api?.getPackageDebugValue(CONSTANTS.MODULE_ID, "boolean")) {
        console.log(`DEBUG | ${CONSTANTS.MODULE_ID} | ${msg}`, ...args);
      }
    } catch (e) {
      console.error(e.message);
    }
    return msg;
  }
  static logObject(...args) {
    return this.log("", args);
  }
  static log(message, ...args) {
    try {
      message = `${CONSTANTS.MODULE_ID} | ${message}`;
      console.log(message.replace("<br>", "\n"), ...args);
    } catch (e) {
      console.error(e.message);
    }
    return message;
  }
  static notify(message, ...args) {
    try {
      message = `${CONSTANTS.MODULE_ID} | ${message}`;
      ui.notifications?.notify(message);
      console.log(message.replace("<br>", "\n"), ...args);
    } catch (e) {
      console.error(e.message);
    }
    return message;
  }
  static info(info, notify = false, ...args) {
    try {
      info = `${CONSTANTS.MODULE_ID} | ${info}`;
      if (notify) {
        ui.notifications?.info(info);
      }
      console.log(info.replace("<br>", "\n"), ...args);
    } catch (e) {
      console.error(e.message);
    }
    return info;
  }
  static warn(warning, notify = false, ...args) {
    try {
      warning = `${CONSTANTS.MODULE_ID} | ${warning}`;
      if (notify) {
        ui.notifications?.warn(warning);
      }
      console.warn(warning.replace("<br>", "\n"), ...args);
    } catch (e) {
      console.error(e.message);
    }
    return warning;
  }
  static errorObject(...args) {
    return this.error("", false, args);
  }
  static error(error, notify = true, ...args) {
    try {
      error = `${CONSTANTS.MODULE_ID} | ${error}`;
      if (notify) {
        ui.notifications?.error(error);
      }
      console.error(error.replace("<br>", "\n"), ...args);
    } catch (e) {
      console.error(e.message);
    }
    return new Error(error.replace("<br>", "\n"));
  }
  static timelog(message) {
    warn(Date.now(), message);
  }
  // setDebugLevel = (debugText): void => {
  //   debugEnabled = { none: 0, warn: 1, debug: 2, all: 3 }[debugText] || 0;
  //   // 0 = none, warnings = 1, debug = 2, all = 3
  //   if (debugEnabled >= 3) CONFIG.debug.hooks = true;
  // };
  static dialogWarning(message, icon = "fas fa-exclamation-triangle") {
    return `<p class="${CONSTANTS.MODULE_ID}-dialog">
        <i style="font-size:3rem;" class="${icon}"></i><br><br>
        <strong style="font-size:1.2rem;">${CONSTANTS.MODULE_ID}</strong>
        <br><br>${message}
    </p>`;
  }
};
__name(_Logger, "Logger");
__publicField(_Logger, "i18n", (key) => {
  return game.i18n.localize(key)?.trim();
});
__publicField(_Logger, "i18nFormat", (key, data = {}) => {
  return game.i18n.format(key, data)?.trim();
});
let Logger = _Logger;
const _TransitionForm = class _TransitionForm extends FormApplication {
  constructor(object, options) {
    super(object, options);
    this.transition = object || {};
    this.data = {};
    this.interval = null;
  }
  /**
   *
   */
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: "scene-transitions-form",
      title: game.i18n.localize(`${CONSTANTS.MODULE_ID}.label.editTransition`),
      template: `modules/${CONSTANTS.MODULE_ID}/templates/transition-form.html`,
      classes: ["sheet", "scene-transitions-form"],
      height: 500,
      width: 436
    });
  }
  /**
   * Get data for the triggler form
   */
  async getData(options) {
    let context = this.transition.options;
    let sceneTransitionContent = await TextEditor.enrichHTML(this.transition.options.content, {
      secrets: true,
      async: true
    });
    let sceneTransitionBg = ``;
    if (isVideo(this.transition.options.bgImg)) {
      sceneTransitionBg = `<div id="scene-transitions" class="scene-transitions preview">
					<div class="color-overlay"></div>
					<video class="scene-transitions-bg"
						autoplay
						${this.transition.options.bgLoop ? "loop" : ""}
						${this.transition.options.bgMuted ? "muted" : ""}>
						<source src="${this.transition.options.bgImg}" type="${getVideoType(this.transition.options.bgImg)}">
					</video>
					<div class="scene-transitions-content">
						${sceneTransitionContent}
					</div>
				</div>`;
    } else {
      sceneTransitionBg = `<div id="scene-transitions" class="scene-transitions preview">
				<div class="scene-transitions-bg" style="max-height: 100%; background-image:url(${this.transition.options.bgImg})">
				</div>
				<div class="scene-transitions-content">
					${sceneTransitionContent}
				</div>
			</div>`;
    }
    context.sceneTransitionBgHTML = sceneTransitionBg;
    context.contentHTML = sceneTransitionContent;
    return context;
  }
  updatePreview() {
    const preview = $("#scene-transitions");
    preview.find(".scene-transitions-bg").css({
      backgroundImage: "url(" + this.transition.options.bgImg + ")",
      opacity: this.transition.options.bgOpacity,
      backgroundColor: this.transition.options.bgColor
    });
    preview.find(".scene-transitions-content").css({ color: this.transition.options.fontColor });
  }
  /** @inheritdoc */
  async activateEditor(name, options = {}, initialContent = "") {
    options.plugins = {
      menu: ProseMirror.ProseMirrorMenu.build(ProseMirror.defaultSchema, {
        compact: true,
        destroyOnSave: false,
        onSave: () => {
          this._saveEditor(name, { remove: false });
        }
      })
    };
    return super.activateEditor(name, options, initialContent);
  }
  /**
   * Handle saving the content of a specific editor by name
   * @param {string} name           The named editor to save
   * @param {boolean} [remove]      Remove the editor after saving its content
   * @returns {Promise<void>}
   */
  async _saveEditor(name, { remove = true } = {}) {
    const editor = this.editors[name];
    if (!editor || !editor.instance)
      throw new Error(`${name} is not an active editor name!`);
    editor.active = false;
    const instance = editor.instance;
    await this._onSubmit(new Event("submit"), {
      preventClose: true
    });
    if (remove) {
      instance.destroy();
      editor.instance = editor.mce = null;
      if (editor.hasButton)
        editor.button.style.display = "block";
      this.render();
    }
    editor.changed = false;
  }
  /* -------------------------------------------- */
  async activateListeners(html) {
    super.activateListeners(html);
    html.on("change", "input,select,textarea", this._onChangeInput.bind(this));
    const bgImageInput = html.find('input[name="bgImg"]');
    html.find('input[name="bgColor"]');
    const bgOpacityInput = html.find('input[name="bgOpacity"]');
    const bgSizeInput = html.find('input[name="bgSize"]');
    const bgPosInput = html.find('input[name="bgPos"]');
    html.find('input[name="bgLoop"]');
    html.find('input[name="bgMuted"]');
    const fontSizeInput = html.find('input[name="fontSize"]');
    html.find('input[name="fontColor"]');
    html.find(".mce-content-body");
    const volumeSlider = html.find('input[name="volume"]');
    html.find('input[name="audioLoop"]');
    html.find('input[name="audio"]');
    html.find('input[name="volume"]');
    html.find('input[name="showUI"]');
    const preview = $("#scene-transitions");
    bgSizeInput.on("change", (e) => {
      this.data.bgSize = e.target.value;
      preview.find(".scene-transitions-bg").css("background-size", this.data.bgSize);
    });
    bgPosInput.on("change", (e) => {
      this.data.bgPos = e.target.value;
      preview.find(".scene-transitions-bg").css("background-position", this.data.bgPos);
    });
    bgImageInput.on("change", (e) => {
      this.data.bgImg = e.target.value;
      preview.find(".scene-transitions-bg").css("background-image", `url(${this.data.bgImg})`);
    });
    bgOpacityInput.on("change", (e) => {
      this.data.bgOpacity = e.target.value;
      preview.find(".scene-transitions-bg").css("opacity", e.target.value);
    });
    fontSizeInput.on("change", (e) => {
      preview.find(".scene-transitions-content").css("font-size", e.target.value);
    });
    html.find('button[name="cancel"]').on("click", () => {
      this.close();
    });
    html.find('button[name="save"]').on("click", () => {
      this._onSubmit();
    });
    volumeSlider.on("change", (e) => {
      if (this.playingAudio?.playing) {
        this.playingAudio.gain.value = e.target.value;
      }
    });
    const contentHTML = await TextEditor.enrichHTML(this.transition.options.content, {
      secrets: true,
      async: true
    });
    $('[data-edit="content"]').html(contentHTML);
  }
  close() {
    this.transition.playingAudio.stop();
    super.close();
  }
  async _onSubmit(event, { updateData = null, preventClose = false, preventRender = false } = {}) {
    const states = this.constructor.RENDER_STATES;
    if (this._state === states.NONE || !this.options.editable || this._submitting) {
      return false;
    }
    this._submitting = true;
    this.transition.playingAudio.stop();
    this.element.find("form").first()[0];
    const priorState = this._state;
    if (this.options.closeOnSubmit) {
      this._state = states.CLOSING;
    }
    if (preventRender && this._state !== states.CLOSING) {
      this._state = states.RENDERING;
    }
    const formData = this._getSubmitData(updateData);
    this.transition.updateData(formData);
    const scene = game.scenes?.get(this.transition.options.sceneID);
    if (this.transition.options.sceneID && scene) {
      await scene.setFlag(CONSTANTS.MODULE_ID, "transition", this.transition);
    } else {
      Logger.warn(`No scene is been found with sceneId ${this.transition.options.sceneID}`);
      return;
    }
    this._submitting = false;
    this._state = priorState;
    if (this.options.closeOnSubmit && !preventClose) {
      this.close({ submit: false });
    }
    return formData;
  }
  _onChangeColorPicker(event) {
    const input = event.target;
    const form = input.form;
    form[input.dataset.edit].value = input.value;
    if ($(input).attr("data-edit") == "bgColor") {
      this.data.bgColor = event.target.value;
      $("#scene-transitions").css("background-color", event.target.value);
    } else if ($(input).attr("data-edit") == "fontColor") {
      $("#scene-transitions").find(".scene-transitions-content").css("color", event.target.value);
    }
  }
  async _updateObject(event, formData) {
    return true;
  }
};
__name(_TransitionForm, "TransitionForm");
let TransitionForm = _TransitionForm;
let sceneTransitionsSocket;
function registerSocket() {
  Logger.debug("Registered sceneTransitionsSocket");
  if (sceneTransitionsSocket) {
    return sceneTransitionsSocket;
  }
  sceneTransitionsSocket = socketlib.registerModule(CONSTANTS.MODULE_ID);
  sceneTransitionsSocket.register("executeAction", (...args) => API.executeActionArr(...args));
  sceneTransitionsSocket.register("macro", (...args) => API.macroArr(...args));
  game.modules.get(CONSTANTS.MODULE_ID).socket = sceneTransitionsSocket;
  return sceneTransitionsSocket;
}
__name(registerSocket, "registerSocket");
const _Utils = class _Utils {
  /**
   * Convert seconds into milliseconds
   * @param {number} seconds The seconds
   * @returns {number}       The milliseconds
   */
  static convertSecondsToMilliseconds(seconds) {
    if (!seconds)
      return 0;
    return seconds * 1e3;
  }
  /**
   * Get the first image source from a journal page
   * @param {object} page The page
   * @returns {string}    The image source
   */
  static getFirstImageFromPage(page) {
    const content = page?.text?.content;
    if (!content)
      return null;
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, "text/html");
    const src = doc.querySelector("img").getAttribute("src");
    return src || null;
  }
  /**
   * Get text including HTML tags from a journal page
   * @param {object} page The page
   * @returns {string}    The text
   */
  static getTextFromPage(page) {
    const content = page?.text?.content;
    if (!content)
      return null;
    const textTags = ["BLOCKQUOTE", "CODE", "H1", "H2", "H3", "H4", "H5", "H6", "P"];
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, "text/html");
    const tags = Array.from(doc.body.children);
    const filteredTags = tags.filter((tag) => textTags.includes(tag.tagName));
    const text = filteredTags.map((tag) => tag.outerHTML).join("");
    return text || null;
  }
  /**
   * Preload video metadata
   * @param {string} src The video source
   * @returns {object}   The video
   */
  static preloadVideoMetadata(src) {
    return new Promise((resolve, reject) => {
      try {
        const video = document.createElement("video");
        video.setAttribute("src", src);
        video.preload = "metadata";
        video.onloadedmetadata = function() {
          resolve(this);
        };
        video.onerror = function() {
          reject("Invalid video. Please select a video file.");
        };
        return video;
      } catch (e) {
        reject(e);
      }
    });
  }
};
__name(_Utils, "Utils");
let Utils = _Utils;
const _SceneTransition = class _SceneTransition {
  /**
   *
   * @param {boolean} preview
   * @param {object} options: v0.1.1 options go here. Previously sceneID
   * @param {object} optionsBackCompat: Previously used for options. Deprecated as of 0.1.1
   */
  constructor(preview, options, optionsBackCompat) {
    /**
     * Append the scene transitions element to the body
     * @returns {object} The scene transitions element
     */
    __privateAdd(this, _appendSceneTransitionsElement);
    /**
     * Append the background element to the main element
     * @private
     */
    __privateAdd(this, _appendBackgroundElement);
    /**
     * Append the video background element to the main element
     * @private
     */
    __privateAdd(this, _appendVideoBackgroundElement);
    /**
     * Append the static background element to the main element
     * @private
     */
    __privateAdd(this, _appendStaticBackgroundElement);
    /**
     * Append the content element to the main element
     * @private
     */
    __privateAdd(this, _appendContentElement);
    /**
     * Add on click listener to the main element
     */
    __privateAdd(this, _addOnClick);
    /**
     * Play the audio
     * @private
     */
    __privateAdd(this, _playAudio);
    /**
     * Execute the fade in of the main element
     * @private
     * @param {object} contentElement The content element
     */
    __privateAdd(this, _executeFadeIn);
    if (optionsBackCompat) {
      optionsBackCompat.sceneID = options;
      options = optionsBackCompat;
      Logger.warn(
        "sceneID and options have been combined into paramater 2 'new Transition(preview, options)' - update your macro asap"
      );
    }
    this.preview = preview;
    this.options = {
      ...this.constructor.defaultOptions,
      ...options
    };
    this.journal = null;
    this.sceneTransitionsElement = null;
    this.destroying = false;
    this.playingAudio = new Sound("");
  }
  static get defaultOptions() {
    return new SceneTransitionOptions({
      sceneID: "",
      gmHide: true,
      fontColor: "#777777",
      fontSize: "28px",
      bgImg: "",
      bgPos: "center center",
      bgLoop: true,
      bgMuted: true,
      bgSize: "cover",
      bgColor: "#000000",
      bgOpacity: 0.7,
      fadeIn: 400,
      delay: 4e3,
      fadeOut: 1e3,
      volume: 1,
      audioLoop: true,
      skippable: true,
      gmEndAll: true,
      showUI: false,
      activateScene: false,
      content: "",
      audio: "",
      fromSocket: false,
      users: []
    });
  }
  // static get hasNewAudioAPI() {
  //
  // 	return typeof Howl != "undefined" ? false : true;
  // }
  /********************
   * Button functions for Foundry menus and window headers
   *******************/
  /**
   * Handles the renderSceneConfig Hook
   *
   * Injects HTML into the scene config.
   *
   * @static
   * @param {SceneConfig} sceneConfig - The Scene config sheet
   * @param {jQuery} html - The HTML of the sheet
   * @param {object} data - Data associated with the sheet rendering
   * @memberof PinFixer
   */
  static async renderSceneConfig(sceneConfig, html, data) {
    const ambItem = html.find(".item[data-tab=ambience]");
    const ambTab = html.find(".tab[data-tab=ambience]");
    ambItem.after(`<a class="item" data-tab="scene-transitions">
		<i class="fas fa-bookmark"></i> ${game.i18n.localize(`${CONSTANTS.MODULE_ID}.scene.config.title`)}</a>`);
    ambTab.after(await this.getSceneHtml(this.getSceneTemplateData(data)));
    this.attachEventListeners(html);
  }
  /**
   * The HTML to be added to the scene configuration
   * in order to configure Pin Fixer for the scene.
   *
   * @param {PinFixSettings} settings - The Pin Fixer settings of the scene being configured.
   * @static
   * @return {string} The HTML to be injected
   * @memberof PinFixer
   */
  static async getSceneHtml(settings) {
    return await renderTemplate(`modules/${CONSTANTS.MODULE_ID}/templates/transition-form.html`, settings);
  }
  /**
   * Retrieves the current data for the scene being configured.
   *
   * @static
   * @param {object} data - The data being passed to the scene config template
   * @return {PinFixSettings}
   * @memberof PinFixer
   */
  static getSceneTemplateData(hookData) {
    let data = getProperty(hookData.data?.flags[CONSTANTS.MODULE_ID], "transition.options");
    if (!data) {
      data = {
        sceneID: "",
        gmHide: true,
        fontColor: "#777777",
        fontSize: "28px",
        bgImg: "",
        bgPos: "center center",
        bgLoop: true,
        bgMuted: true,
        bgSize: "cover",
        bgColor: "#000000",
        bgOpacity: 0.7,
        fadeIn: 400,
        delay: 4e3,
        fadeOut: 1e3,
        volume: 1,
        audioLoop: true,
        skippable: true,
        gmEndAll: true,
        showUI: false,
        activateScene: false,
        content: "",
        audio: "",
        fromSocket: false,
        users: []
      };
    }
    return data;
  }
  static addPlayTransitionBtn(idField) {
    return {
      name: game.i18n.localize(`${CONSTANTS.MODULE_ID}.label.playTransition`),
      icon: '<i class="fas fa-play-circle"></i>',
      condition: (li) => {
        const scene = game.scenes?.get(li.data(idField));
        if (game.user?.isGM && typeof scene.getFlag(CONSTANTS.MODULE_ID, "transition") == "object") {
          return true;
        } else {
          return false;
        }
      },
      callback: (li) => {
        let sceneID = li.data(idField);
        game.scenes?.preload(sceneID, true);
        const scene = game.scenes?.get(li.data(idField));
        let transition = scene.getFlag(CONSTANTS.MODULE_ID, "transition");
        let options = transition.options;
        options.sceneID = sceneID;
        options = {
          ...options,
          fromSocket: true
        };
        if (!sceneTransitionsSocket) {
          registerSocket();
        }
        sceneTransitionsSocket.executeForEveryone("executeAction", options);
      }
    };
  }
  static addCreateTransitionBtn(idField) {
    return {
      name: "Create Transition",
      icon: '<i class="fas fa-plus-square"></i>',
      condition: (li) => {
        const scene = game.scenes?.get(li.data(idField));
        if (game.user?.isGM && !scene.getFlag(CONSTANTS.MODULE_ID, "transition")) {
          return true;
        } else {
          return false;
        }
      },
      callback: (li) => {
        let sceneID = li.data(idField);
        let options = {
          sceneID
        };
        let activeTransition = new _SceneTransition(true, options, void 0);
        activeTransition.render();
        new TransitionForm(activeTransition, void 0).render(true);
      }
    };
  }
  static addEditTransitionBtn(idField) {
    return {
      name: "Edit Transition",
      icon: '<i class="fas fa-edit"></i>',
      condition: (li) => {
        const scene = game.scenes?.get(li.data(idField));
        if (game.user?.isGM && scene.getFlag(CONSTANTS.MODULE_ID, "transition")) {
          return true;
        } else {
          return false;
        }
      },
      callback: (li) => {
        let scene = game.scenes?.get(li.data(idField));
        let transition = scene.getFlag(CONSTANTS.MODULE_ID, "transition");
        let activeTransition = new _SceneTransition(true, transition.options, void 0);
        activeTransition.render();
        new TransitionForm(activeTransition, void 0).render(true);
      }
    };
  }
  static addDeleteTransitionBtn(idField) {
    return {
      name: game.i18n.localize(`${CONSTANTS.MODULE_ID}.label.deleteTransition`),
      icon: '<i class="fas fa-trash-alt"></i>',
      condition: (li) => {
        const scene = game.scenes?.get(li.data(idField));
        if (game.user?.isGM && scene.getFlag(CONSTANTS.MODULE_ID, "transition")) {
          return true;
        } else {
          return false;
        }
      },
      callback: (li) => {
        let scene = game.scenes?.get(li.data(idField));
        scene.unsetFlag(CONSTANTS.MODULE_ID, "transition");
      }
    };
  }
  static addPlayTransitionBtnJE(idField) {
    return {
      name: game.i18n.localize(`${CONSTANTS.MODULE_ID}.label.playTransitionFromJournal`),
      icon: '<i class="fas fa-play-circle"></i>',
      condition: (li) => {
        if (game.user?.isGM) {
          return true;
        } else {
          return false;
        }
      },
      callback: (li) => {
        let id = li.data(idField);
        let journal = game.journal?.get(id)?.data;
        if (!journal) {
          Logger.warn(`No journal is found`);
          return;
        }
        const content = retrieveFirstTextFromJournalId(id, void 0, false);
        const img = retrieveFirstImageFromJournalId(id, void 0, false);
        let options = new SceneTransitionOptions({
          sceneID: void 0,
          content,
          bgImg: img
        });
        options = {
          ...options,
          fromSocket: true
        };
        if (!sceneTransitionsSocket) {
          registerSocket();
        }
        sceneTransitionsSocket.executeForEveryone("executeAction", options);
      }
    };
  }
  /**
   * The Magic happens here
   * @returns
   */
  async render() {
    _SceneTransition.activeTransition = this;
    if (this.options.gmHide && game.user?.isGM) {
      Logger.info(`Option 'gmHide' is true and you are a GM so you don't see the transition`);
      return;
    }
    this.options.zIndex = game.user?.isGM || this.options.showUI ? 1 : 5e3;
    if (this.sceneTransitionsElement) {
      this.destroy(true);
    }
    this.sceneTransitionsElement = __privateMethod(this, _appendSceneTransitionsElement, appendSceneTransitionsElement_fn).call(this);
    await __privateMethod(this, _appendBackgroundElement, appendBackgroundElement_fn).call(this);
    const contentElement = __privateMethod(this, _appendContentElement, appendContentElement_fn).call(this);
    __privateMethod(this, _addOnClick, addOnClick_fn).call(this);
    if (this.options.audio) {
      __privateMethod(this, _playAudio, playAudio_fn).call(this);
    }
    __privateMethod(this, _executeFadeIn, executeFadeIn_fn).call(this, contentElement);
  }
  setDelay() {
    this.timeout = setTimeout(
      function() {
        this.destroy();
      }.bind(this),
      this.options.delay
    );
  }
  destroy(instant = false) {
    if (this.destroying == true)
      return;
    this.destroying = true;
    let time = instant ? 0 : this.options.fadeOut;
    clearTimeout(this.timeout);
    if (this.playingAudio?.playing) {
      this.fadeAudio(this.playingAudio, time);
    }
    $(this.sceneTransitionsElement)?.fadeOut(time, () => {
      this.sceneTransitionsElement.remove();
      this.sceneTransitionsElement = null;
    });
  }
  updateData(newData) {
    this.options = mergeObject(this.options, newData);
    return this;
  }
  getJournalText() {
    return retrieveFirstTextFromJournalId(this.journal?.id, void 0, false);
  }
  getJournalImg() {
    return retrieveFirstImageFromJournalId(this.journal?.id, void 0, false);
  }
  fadeAudio(audio, time) {
    if (!audio?.playing) {
      return;
    }
    if (time == 0) {
      audio.stop();
      return;
    }
    let volume = audio.gain.value;
    let targetVolume = 1e-6;
    let speed = volume / time * 50;
    audio.gain.value = volume;
    let fade = /* @__PURE__ */ __name(function() {
      volume -= speed;
      audio.gain.value = volume.toFixed(6);
      if (volume.toFixed(6) <= targetVolume) {
        audio.stop();
        clearInterval(audioFadeTimer);
      }
    }, "fade");
    let audioFadeTimer = setInterval(fade, 50);
    fade();
  }
};
_appendSceneTransitionsElement = new WeakSet();
appendSceneTransitionsElement_fn = /* @__PURE__ */ __name(function() {
  const element = document.createElement("div");
  element.setAttribute("id", "scene-transitions");
  element.setAttribute("class", "scene-transitions");
  document.body.appendChild(element);
  return element;
}, "#appendSceneTransitionsElement");
_appendBackgroundElement = new WeakSet();
appendBackgroundElement_fn = /* @__PURE__ */ __name(async function() {
  if (isVideo(this.options.bgImg)) {
    await __privateMethod(this, _appendVideoBackgroundElement, appendVideoBackgroundElement_fn).call(this);
  } else {
    __privateMethod(this, _appendStaticBackgroundElement, appendStaticBackgroundElement_fn).call(this);
  }
  Object.assign(this.sceneTransitionsElement.style, {
    backgroundColor: this.options.bgColor,
    zIndex: this.options.zIndex
  });
}, "#appendBackgroundElement");
_appendVideoBackgroundElement = new WeakSet();
appendVideoBackgroundElement_fn = /* @__PURE__ */ __name(async function() {
  const video = await Utils.preloadVideoMetadata(this.options.bgImg);
  this.options.delay = Utils.convertSecondsToMilliseconds(video.duration);
  const colorOverlayElement = document.createElement("div");
  colorOverlayElement.setAttribute("class", "color-overlay");
  Object.assign(colorOverlayElement.style, {
    opacity: this.options.bgOpacity,
    backgroundColor: this.options.bgColor,
    zIndex: this.options.zIndex,
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100vh"
  });
  this.sceneTransitionsElement.appendChild(colorOverlayElement);
  const videoElement = document.createElement("video");
  videoElement.setAttribute("class", "scene-transitions-bg");
  videoElement.setAttribute("autoplay", "");
  if (this.options.bgLoop) {
    videoElement.setAttribute("loop", "");
  }
  if (this.options.bgMuted) {
    videoElement.setAttribute("muted", "");
  }
  Object.assign(videoElement.style, {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%"
  });
  const sourceElement = document.createElement("source");
  sourceElement.setAttribute("src", this.options.bgImg);
  sourceElement.setAttribute("type", getVideoType(this.options.bgImg));
  videoElement.appendChild(sourceElement);
  this.sceneTransitionsElement.appendChild(videoElement);
}, "#appendVideoBackgroundElement");
_appendStaticBackgroundElement = new WeakSet();
appendStaticBackgroundElement_fn = /* @__PURE__ */ __name(function() {
  const backgroundElement = document.createElement("div");
  backgroundElement.setAttribute("class", "scene-transitions-bg");
  Object.assign(backgroundElement.style, {
    backgroundImage: `url(${this.options.bgImg})`,
    opacity: this.options.bgOpacity,
    backgroundSize: this.options.bgSize,
    backgroundPosition: this.options.bgPos
  });
  this.sceneTransitionsElement.appendChild(backgroundElement);
}, "#appendStaticBackgroundElement");
_appendContentElement = new WeakSet();
appendContentElement_fn = /* @__PURE__ */ __name(function() {
  const contentElement = document.createElement("div");
  contentElement.setAttribute("class", "scene-transitions-content");
  Object.assign(contentElement.style, {
    color: this.options.fontColor,
    fontSize: this.options.fontSize,
    zIndex: 5e3
  });
  contentElement.innerHTML = this.options.content;
  this.sceneTransitionsElement.appendChild(contentElement);
  return contentElement;
}, "#appendContentElement");
_addOnClick = new WeakSet();
addOnClick_fn = /* @__PURE__ */ __name(function() {
  const onClick = /* @__PURE__ */ __name(() => {
    if (game.user?.isGM && this.options.gmEndAll) {
      let options = new SceneTransitionOptions({ action: "end" });
      options = {
        ...options,
        fromSocket: true
      };
      if (!sceneTransitionsSocket) {
        registerSocket();
      }
      sceneTransitionsSocket.executeForEveryone("executeAction", options);
    }
    this.destroy();
  }, "onClick");
  if (game.user?.isGM || this.options.skippable) {
    $(this.sceneTransitionsElement).on("click", onClick);
  }
}, "#addOnClick");
_playAudio = new WeakSet();
playAudio_fn = /* @__PURE__ */ __name(function() {
  if (game.audio.locked) {
    Logger.info("Audio playback locked, cannot play " + this.options.audio);
  } else {
    let thisTransition = this;
    AudioHelper.play(
      {
        src: this.options.audio,
        volume: this.options.volume,
        loop: String(this.options.audioLoop) === "true" ? true : false
      },
      false
    ).then(function(audio) {
      audio.on("start", (a) => {
      });
      audio.on("stop", (a) => {
      });
      audio.on("end", (a) => {
      });
      thisTransition.playingAudio = audio;
    });
  }
}, "#playAudio");
_executeFadeIn = new WeakSet();
executeFadeIn_fn = /* @__PURE__ */ __name(function(contentElement) {
  const activateScene = /* @__PURE__ */ __name(() => {
    if (!this.options.preview) {
      const scene = game.scenes?.get(this.options.sceneID);
      if (game.user?.isGM && !scene) {
        Logger.info(`The scene has not been activated as scene [${this.options.sceneID}] was not found`);
        return;
      }
      if (this.options.activateScene) {
        scene.activate();
      } else if (game.user?.isGM) {
        scene.view();
      }
    }
  }, "activateScene");
  $(contentElement).fadeIn();
  this.setDelay();
  $(this.sceneTransitionsElement).fadeIn(this.options.fadeIn, activateScene);
}, "#executeFadeIn");
__name(_SceneTransition, "SceneTransition");
let SceneTransition = _SceneTransition;
SceneTransition.activeTransition = new SceneTransition(void 0, void 0, void 0);
const API = {
  async executeActionArr(...inAttributes) {
    if (!Array.isArray(inAttributes)) {
      throw Logger.error("executeActionArr | inAttributes must be of type array");
    }
    let [options] = inAttributes;
    options = {
      ...options,
      fromSocket: true
    };
    this.executeAction(options);
  },
  executeAction(options) {
    let activeTransition = SceneTransition.activeTransition;
    if (activeTransition) {
      activeTransition.destroy(true);
    }
    if (options?.action == "end") {
      return;
    }
    activeTransition = new SceneTransition(false, options, void 0);
    activeTransition.render();
  },
  async macroArr(...inAttributes) {
    if (!Array.isArray(inAttributes)) {
      throw Logger.error("macroArr | inAttributes must be of type array");
    }
    let [options, showMe] = inAttributes;
    options = {
      ...options,
      fromSocket: true
    };
    macro(options, showMe);
  },
  macro(options, showMe) {
    if (options.fromSocket) {
      API.executeAction(options);
    } else {
      if (options.users?.length > 0) {
        if (showMe) {
          if (!options.users.includes(game.user.id)) {
            options.users.push(game.user.id);
          }
        } else {
          if (options.users.includes(game.user.id)) {
            const excludeNames = [game.user.id];
            options.users = options.users.filter((name) => !excludeNames.includes(name));
          }
        }
        options = {
          ...options,
          fromSocket: true
        };
        sceneTransitionsSocket.executeForUsers("executeAction", options.users, options);
      } else {
        if (showMe) {
          options = {
            ...options,
            fromSocket: true
          };
          sceneTransitionsSocket.executeForEveryone("executeAction", options);
        } else {
          options = {
            ...options,
            fromSocket: true
          };
          sceneTransitionsSocket.executeForOthers("executeAction", options);
        }
      }
    }
  }
};
const initHooks = /* @__PURE__ */ __name(() => {
  Hooks.once("socketlib.ready", registerSocket);
  registerSocket();
}, "initHooks");
const setupHooks = /* @__PURE__ */ __name(() => {
  game.modules.get(CONSTANTS.MODULE_ID).api = API;
}, "setupHooks");
Hooks.on("closeTransitionForm", (form) => {
  let activeSceneTransition = form.object;
  activeSceneTransition.destroy(true);
  clearInterval(form.interval);
});
Hooks.on(
  "getSceneNavigationContext",
  (html, contextOptions) => addContextButtons("getSceneNavigationContext", contextOptions)
);
Hooks.on(
  "getSceneDirectoryEntryContext",
  (html, contextOptions) => addContextButtons("getSceneDirectoryEntryContext", contextOptions)
);
Hooks.on(
  "getJournalDirectoryEntryContext",
  (html, contextOptions) => addContextButtons("getJournalDirectoryEntryContext", contextOptions)
);
Hooks.on("renderJournalSheet", (journal) => addJournalButton(journal));
function addContextButtons(hookName, contextOptions) {
  const idField = {
    getJournalDirectoryEntryContext: "documentId",
    getSceneDirectoryEntryContext: "documentId",
    getSceneNavigationContext: "sceneId"
  };
  if (hookName === "getJournalDirectoryEntryContext") {
    contextOptions.push(SceneTransition.addPlayTransitionBtnJE(idField[hookName]));
    return;
  }
  contextOptions.push(SceneTransition.addPlayTransitionBtn(idField[hookName]));
  contextOptions.push(SceneTransition.addCreateTransitionBtn(idField[hookName]));
  contextOptions.push(SceneTransition.addEditTransitionBtn(idField[hookName]));
  contextOptions.push(SceneTransition.addDeleteTransitionBtn(idField[hookName]));
}
__name(addContextButtons, "addContextButtons");
function addJournalButton(journal) {
  const pageTypes = ["image", "text", "video"];
  if (!game.user?.isGM)
    return;
  const showJournalHeaderSetting = game.settings.get(CONSTANTS.MODULE_ID, CONSTANTS.SETTINGS.SHOW_JOURNAL_HEADER);
  if (!showJournalHeaderSetting)
    return;
  const header = journal.element[0].querySelector("header");
  if (!header)
    return;
  const windowTitle = header.querySelector(`h4[class="window-title"]`);
  if (!windowTitle)
    return;
  const existingLink = header.querySelector("a.play-transition");
  if (existingLink) {
    existingLink.remove();
  }
  const page = journal.getData().pages[0];
  if (!pageTypes.includes(page.type))
    return;
  const linkElement = document.createElement("a");
  linkElement.classList.add("play-transition");
  const iconElement = document.createElement("i");
  iconElement.classList.add("fas", "fa-play-circle");
  linkElement.appendChild(iconElement);
  const textNode = document.createTextNode("Play as Transition");
  linkElement.appendChild(textNode);
  windowTitle.after(linkElement);
  const onClickJournalButton = /* @__PURE__ */ __name((page2) => {
    let content = null;
    let bgImg = null;
    let bgLoop = null;
    switch (page2.type) {
      case "image":
        bgImg = page2.src;
        break;
      case "text":
        content = Utils.getTextFromPage(page2);
        bgImg = Utils.getFirstImageFromPage(page2);
        break;
      case "video":
        bgImg = page2.src;
        bgLoop = page2.video.loop;
        page2.video.volume;
        break;
      default:
        return;
    }
    let options = new SceneTransitionOptions({ content, bgImg, bgLoop });
    sceneTransitionsSocket.executeForEveryone("executeAction", options);
  }, "onClickJournalButton");
  linkElement.addEventListener("click", () => {
    onClickJournalButton(page);
  });
}
__name(addJournalButton, "addJournalButton");
Hooks.once("init", async () => {
  registerSettings();
  initHooks();
});
Hooks.once("setup", function() {
  setupHooks();
});
Hooks.once("ready", async () => {
});
Hooks.once("devModeReady", ({ registerPackageDebugFlag }) => {
  registerPackageDebugFlag(CONSTANTS.MODULE_ID);
});
//# sourceMappingURL=module.js.map
