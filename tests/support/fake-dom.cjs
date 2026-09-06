'use strict';

class FakeEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = Boolean(init.bubbles);
    this.cancelable = Boolean(init.cancelable);
    this.key = init.key ?? '';
    this.code = init.code ?? '';
    this.target = null;
    this.currentTarget = null;
    this.defaultPrevented = false;
    this.propagationStopped = false;
  }

  preventDefault() {
    if (this.cancelable) this.defaultPrevented = true;
  }

  stopPropagation() {
    this.propagationStopped = true;
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.style = {};
    this.textContent = '';
    this.isContentEditable = false;
    this.isConnected = false;
    this.hidden = false;
    this.clientWidth = 0;
    this.clientHeight = 0;
    this.selectionStart = 0;
    this.selectionEnd = 0;
  }

  set id(value) { this.setAttribute('id', value); }
  get id() { return this.getAttribute('id') || ''; }
  set className(value) { this.setAttribute('class', value); }
  get className() { return this.getAttribute('class') || ''; }

  setAttribute(name, value) { this.attributes.set(String(name), String(value)); }
  getAttribute(name) { return this.attributes.get(String(name)) ?? null; }
  hasAttribute(name) { return this.attributes.has(String(name)); }
  removeAttribute(name) { this.attributes.delete(String(name)); }

  append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
  appendChild(node) {
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this;
    this.children.push(node);
    node._setConnected(this.isConnected || this.tagName === '#DOCUMENT');
    return node;
  }
  insertBefore(node, reference) {
    if (!reference) return this.appendChild(node);
    if (node.parentNode) node.parentNode.removeChild(node);
    const index = this.children.indexOf(reference);
    node.parentNode = this;
    this.children.splice(index < 0 ? this.children.length : index, 0, node);
    node._setConnected(this.isConnected);
    return node;
  }
  removeChild(node) {
    const index = this.children.indexOf(node);
    if (index >= 0) this.children.splice(index, 1);
    node.parentNode = null;
    node._setConnected(false);
    return node;
  }
  _setConnected(value) {
    this.isConnected = value;
    this.children.forEach((child) => child._setConnected(value));
  }

  addEventListener(type, listener) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(listener);
    this.listeners.set(type, handlers);
  }
  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter((entry) => entry !== listener));
  }
  dispatchEvent(event) {
    const dispatched = event instanceof FakeEvent ? event : new FakeEvent(event.type, event);
    if (!dispatched.target) dispatched.target = this;
    dispatched.currentTarget = this;
    for (const listener of this.listeners.get(dispatched.type) || []) listener.call(this, dispatched);
    if (dispatched.bubbles && !dispatched.propagationStopped && this.parentNode) {
      this.parentNode.dispatchEvent(dispatched);
    }
    return !dispatched.defaultPrevented;
  }
  click() { this.dispatchEvent(new FakeEvent('click', { bubbles: true, cancelable: true })); }
  focus() { this.ownerDocument.activeElement = this; }
  setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
  closest(selector) {
    let node = this;
    while (node) {
      if (node.matches(selector)) return node;
      node = node.parentNode;
    }
    return null;
  }
  matches(selector) { return selector.split(',').some((part) => matchesSimple(this, part.trim())); }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
  querySelectorAll(selector) {
    const result = [];
    const visit = (node) => {
      node.children.forEach((child) => {
        if (child.matches(selector)) result.push(child);
        visit(child);
      });
    };
    visit(this);
    return result;
  }
  getBoundingClientRect() {
    return { width: this.clientWidth, height: this.clientHeight, top: 0, left: 0 };
  }
}

function matchesSimple(element, selector) {
  const tag = selector.match(/^([a-z][\w-]*)/i)?.[1];
  if (tag && element.tagName !== tag.toUpperCase()) return false;
  const id = selector.match(/#([\w-]+)/)?.[1];
  if (id && element.id !== id) return false;
  for (const cls of selector.matchAll(/\.([\w-]+)/g)) {
    if (!element.className.split(/\s+/).includes(cls[1])) return false;
  }
  for (const attr of selector.matchAll(/\[([^\]=]+)(?:=["']?([^\]"']+)["']?)?\]/g)) {
    if (!element.hasAttribute(attr[1]) || (attr[2] && element.getAttribute(attr[1]) !== attr[2])) return false;
  }
  return Boolean(tag || id || selector.includes('.') || selector.includes('['));
}

class FakeDocument extends FakeElement {
  constructor() {
    super('#document', null);
    this.ownerDocument = this;
    this.activeElement = null;
    this.documentElement = new FakeElement('html', this);
    this.body = new FakeElement('body', this);
    this.appendChild(this.documentElement);
    this.documentElement.appendChild(this.body);
  }
  createElement(tagName) { return new FakeElement(tagName, this); }
  createEvent() { return new FakeEvent(''); }
}

function createDom() {
  const document = new FakeDocument();
  document.documentElement._setConnected(true);
  return { document, window: { document, Event: FakeEvent, KeyboardEvent: FakeEvent } };
}

module.exports = { FakeDocument, FakeElement, FakeEvent, createDom };
