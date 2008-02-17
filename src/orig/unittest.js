// common.js
var Test = {
  Unit: {
    inspect: Object.inspect // security exception workaround
  }
};

// logger.js
Test.Unit.Logger = Class.create({
  initialize: function(element) {
    this.element = $(element);
    if (this.element) this._createLogTable();
  },
  
  start: function(testName) {
    if (!this.element) return;
    this.element.down('tbody').insert('<tr><td>' + testName + '</td><td></td><td></td></tr>');
  },
  
  setStatus: function(status) {
    this.getLastLogLine().addClassName(status).down('td', 1).update(status);
  },
  
  finish: function(status, summary) {
    if (!this.element) return;
    this.setStatus(status);
    this.message(summary);
  },
  
  message: function(message) {
    if (!this.element) return;
    this.getMessageCell().update(this._toHTML(message));
  },
  
  summary: function(summary) {
    if (!this.element) return;
    this.element.down('div').update(this._toHTML(summary));
  },
  
  getLastLogLine: function() {
    return this.element.select('tr').last()
  },
  
  getMessageCell: function() {
    return this.getLastLogLine().down('td', 2);
  },
  
  _createLogTable: function() {
    var html = '<div class="logsummary">running...</div>' +
    '<table class="logtable">' +
    '<thead><tr><th>Status</th><th>Test</th><th>Message</th></tr></thead>' +
    '<tbody class="loglines"></tbody>' +
    '</table>';
    this.element.update(html);
    
  },
  
  appendActionButtons: function(actions) {
    actions = $H(actions);
    if (!actions.any()) return;
    var div = new Element("div", {className: 'action_buttons'});
    actions.inject(div, function(container, action) {
      var button = new Element("input").setValue(action.key).observe("click", action.value);
      button.type = "button";
      return container.insert(button);
    });
    this.getMessageCell().insert(div);
  },
  
  _toHTML: function(txt) {
    return txt.escapeHTML().replace(/\n/g,"<br/>");
  }
});

// runner.js
Test.Unit.Runner = Class.create({
  initialize: function(testcases) {
    var options = this.options = Object.extend({
      testLog: 'testlog'
    }, arguments[1] || {});
    
    options.resultsURL = this.queryParams.resultsURL;
    options.testLog = $(options.testLog);
    
    this.tests = this.getTests(testcases);
    this.currentTest = 0;
    this.logger = new Test.Unit.Logger(options.testLog);
    Event.observe(window, "load", function() {
      this.runTests.bind(this).delay(0.1);
    }.bind(this));
  },
  
  queryParams: window.location.search.parseQuery(),
  
  getTests: function(testcases) {
    var tests, options = this.options;
    if (this.queryParams.tests) tests = this.queryParams.tests.split(',');
    else if (options.tests) tests = options.tests;
    else if (options.test) tests = [option.test];
    else tests = Object.keys(testcases).grep(/^test/);
    
    return tests.map(function(test) {
      if (testcases[test])
        return new Test.Unit.Testcase(test, testcases[test], testcases.setup, testcases.teardown);
    }).compact();
  },
  
  getResult: function() {
    var results = {
      tests: this.tests.length,
      assertions: 0,
      failures: 0,
      errors: 0
    };
    
    return this.tests.inject(results, function(results, test) {
      results.assertions += test.assertions;
      results.failures   += test.failures;
      results.errors     += test.errors;
      return results;
    });
  },
  
  postResults: function() {
    if (this.options.resultsURL) {
      new Ajax.Request(this.options.resultsURL, 
        { method: 'get', parameters: this.getResult(), asynchronous: false });
    }
  },
  
  runTests: function() {
    var test = this.tests[this.currentTest], actions;
    
    if (!test) return this.finish();
    if (!test.isWaiting) this.logger.start(test.name);
    test.run();
    if(test.isWaiting) {
      this.logger.message("Waiting for " + test.timeToWait + "ms");
      setTimeout(this.runTests.bind(this), test.timeToWait || 1000);
      return;
    }
    
    this.logger.finish(test.status(), test.summary());
    if (actions = test.actions) this.logger.appendActionButtons(actions);
    this.currentTest++;
    // tail recursive, hopefully the browser will skip the stackframe
    this.runTests();
  },
  
  finish: function() {
    this.postResults();
    this.logger.summary(this.summary());
  },
  
  summary: function() {
    return '#{tests} tests, #{assertions} assertions, #{failures} failures, #{errors} errors'
      .interpolate(this.getResult());
  }
});

// message_template.js
Test.Unit.MessageTemplate = Class.create({
  initialize: function(string) {
    var parts = [];
    (string || '').scan(/(?=[^\\])\?|(?:\\\?|[^\?])+/, function(part) {
      parts.push(part[0]);
    });
    this.parts = parts;
  },
  
  evaluate: function(params) {
    return this.parts.map(function(part) {
      return part == '?' ? Test.Unit.inspect(params.shift()) : part.replace(/\\\?/, '?');
    }).join('');
  }
});

// assertions.js
Test.Unit.Assertions = {
  buildMessage: function(message, template) {
    var args = $A(arguments).slice(2);
    return (message ? message + '\n' : '') + new Test.Unit.MessageTemplate(template).evaluate(args);
  },
  
  flunk: function(message) {
    this.assertBlock(message || 'Flunked', function() { return false });
  },
  
  assertBlock: function(message, block) {
    try {
      block.call(this) ? this.pass() : this.fail(message);
    } catch(e) { this.error(e) }
  },
  
  assert: function(expression, message) {
    message = this.buildMessage(message || 'assert', 'got <?>', expression);
    this.assertBlock(message, function() { return expression });
  },
  
  assertEqual: function(expected, actual, message) {
    message = this.buildMessage(message || 'assertEqual', 'expected <?>, actual: <?>', expected, actual);
    this.assertBlock(message, function() { return expected == actual });
  },
  
  assertNotEqual: function(expected, actual, message) {
    message = this.buildMessage(message || 'assertNotEqual', 'expected <?>, actual: <?>', expected, actual);
    this.assertBlock(message, function() { return expected != actual });
  },
  
  assertEnumEqual: function(expected, actual, message) {
    expected = $A(expected);
    actual = $A(actual);
    message = this.buildMessage(message || 'assertEnumEqual', 'expected <?>, actual: <?>', expected, actual);
    this.assertBlock(message, function() {
      return expected.length == actual.length && expected.zip(actual).all(function(pair) { return pair[0] == pair[1] });
    });
  },
  
  assertEnumNotEqual: function(expected, actual, message) {
    expected = $A(expected);
    actual = $A(actual);
    message = this.buildMessage(message || 'assertEnumNotEqual', '<?> was the same as <?>', expected, actual);
    this.assertBlock(message, function() {
      return expected.length != actual.length || expected.zip(actual).any(function(pair) { return pair[0] != pair[1] });
    });
  },
  
  assertHashEqual: function(expected, actual, message) {
    expected = $H(expected);
    actual = $H(actual);
    var expected_array = expected.toArray().sort(), actual_array = actual.toArray().sort();
    message = this.buildMessage(message || 'assertHashEqual', 'expected <?>, actual: <?>', expected, actual);
    // from now we recursively zip & compare nested arrays
    var block = function() {
      return expected_array.length == actual_array.length && 
        expected_array.zip(actual_array).all(function(pair) {
          return pair.all(Object.isArray) ?
            pair[0].zip(pair[1]).all(arguments.callee) : pair[0] == pair[1];
        });
    };
    this.assertBlock(message, block);
  },
  
  assertHashNotEqual: function(expected, actual, message) {
    expected = $H(expected);
    actual = $H(actual);
    var expected_array = expected.toArray().sort(), actual_array = actual.toArray().sort();
    message = this.buildMessage(message || 'assertHashNotEqual', '<?> was the same as <?>', expected, actual);
    // from now we recursively zip & compare nested arrays
    var block = function() {
      return !(expected_array.length == actual_array.length && 
        expected_array.zip(actual_array).all(function(pair) {
          return pair.all(Object.isArray) ?
            pair[0].zip(pair[1]).all(arguments.callee) : pair[0] == pair[1];
        }));
    };
    this.assertBlock(message, block);
  },
  
  assertIdentical: function(expected, actual, message) {
    message = this.buildMessage(message || 'assertIdentical', 'expected <?>, actual: <?>', expected, actual);
    this.assertBlock(message, function() { return expected === actual });
  },
  
  assertNotIdentical: function(expected, actual, message) { 
    message = this.buildMessage(message || 'assertNotIdentical', 'expected <?>, actual: <?>', expected, actual);
    this.assertBlock(message, function() { return expected !== actual });
  },
  
  assertNull: function(obj, message) {
    message = this.buildMessage(message || 'assertNull', 'got <?>', obj);
    this.assertBlock(message, function() { return obj === null });
  },
  
  assertNotNull: function(obj, message) {
    message = this.buildMessage(message || 'assertNotNull', 'got <?>', obj);
    this.assertBlock(message, function() { return obj !== null });
  },
  
  assertUndefined: function(obj, message) {
    message = this.buildMessage(message || 'assertUndefined', 'got <?>', obj);
    this.assertBlock(message, function() { return typeof obj == "undefined" });
  },
  
  assertNotUndefined: function(obj, message) {
    message = this.buildMessage(message || 'assertNotUndefined', 'got <?>', obj);
    this.assertBlock(message, function() { return typeof obj != "undefined" });
  },
  
  assertNullOrUndefined: function(obj, message) {
    message = this.buildMessage(message || 'assertNullOrUndefined', 'got <?>', obj);
    this.assertBlock(message, function() { return obj == null });
  },
  
  assertNotNullOrUndefined: function(obj, message) {
    message = this.buildMessage(message || 'assertNotNullOrUndefined', 'got <?>', obj);
    this.assertBlock(message, function() { return obj != null });
  },
  
  assertMatch: function(expected, actual, message) {
    message = this.buildMessage(message || 'assertMatch', 'regex <?> did not match <?>', expected, actual);
    this.assertBlock(message, function() { return new RegExp(expected).exec(actual) });
  },
  
  assertNoMatch: function(expected, actual, message) {
    message = this.buildMessage(message || 'assertNoMatch', 'regex <?> matched <?>', expected, actual);
    this.assertBlock(message, function() { return !(new RegExp(expected).exec(actual)) });
  },
  
  assertHidden: function(element, message) {
    message = this.buildMessage(message || 'assertHidden', '? isn\'t hidden.', element);
    this.assertBlock(message, function() { return element.style.display == 'none' });
  },
  
  assertInstanceOf: function(expected, actual, message) {
    message = this.buildMessage(message || 'assertInstanceOf', '<?> was not an instance of the expected type', actual);
    this.assertBlock(message, function() { return actual instanceof expected });
  },
  
  assertNotInstanceOf: function(expected, actual, message) {
    message = this.buildMessage(message || 'assertNotInstanceOf', '<?> was an instance of the expected type', actual);
    this.assertBlock(message, function() { return !(actual instanceof expected) });
  },
  
  assertRespondsTo: function(method, obj, message) {
    message = this.buildMessage(message || 'assertRespondsTo', 'object doesn\'t respond to <?>', method);
    this.assertBlock(message, function() { return (method in obj && typeof obj[method] == 'function') });
  },

  assertRaise: function(exceptionName, method, message) {
    message = this.buildMessage(message || 'assertRaise', '<?> exception expected but none was raised', exceptionName);
    var block = function() {
      try { 
        method();
        return false;
      } catch(e) {
        if (e.name == exceptionName) return true;
        else throw e;
      }
    };
    this.assertBlock(message, block);
  },
  
  assertNothingRaised: function(method, message) {
    try { 
      method();
      this.assert(true, "Expected nothing to be thrown");
    } catch(e) {
      message = this.buildMessage(message || 'assertNothingRaised', '<?> was thrown when nothing was expected.', e);
      this.flunk(message);
    }
  },
  
  _isVisible: function(element) {
    element = $(element);
    if(!element.parentNode) return true;
    this.assertNotNull(element);
    if(element.style && Element.getStyle(element, 'display') == 'none')
      return false;
    
    return arguments.callee.call(this, element.parentNode);
  },
  
  assertVisible: function(element, message) {
    message = this.buildMessage(message, '? was not visible.', element);
    this.assertBlock(message, function() { return this._isVisible(element) });
  },
  
  assertNotVisible: function(element, message) {
    message = this.buildMessage(message, '? was not hidden and didn\'t have a hidden parent either.', element);
    this.assertBlock(message, function() { return !this._isVisible(element) });
  },
  
  assertElementsMatch: function() {
    var pass = true, expressions = $A(arguments), elements = $A(expressions.shift());
    if (elements.length != expressions.length) {
      message = this.buildMessage('assertElementsMatch', 'size mismatch: ? elements, ? expressions (?).', elements.length, expressions.length, expressions);
      this.flunk(message);
      pass = false;
    }
    elements.zip(expressions).all(function(pair, index) {
      var element = $(pair.first()), expression = pair.last();
      if (element.match(expression)) return true;
      message = this.buildMessage('assertElementsMatch', 'In index <?>: expected <?> but got ?', index, expression, element);
      this.flunk(message);
      pass = false;
    }.bind(this))
    
    if (pass) this.assert(true, "Expected all elements to match.");
  },
  
  assertElementMatches: function(element, expression, message) {
    this.assertElementsMatch([element], expression);
  }
};

// test_case.js
Test.Unit.Testcase = Class.create(Test.Unit.Assertions, {
  initialize: function(name, test, setup, teardown) {
    this.name           = name;
    this.test           = test     || Prototype.emptyFunction;
    this.setup          = setup    || Prototype.emptyFunction;
    this.teardown       = teardown || Prototype.emptyFunction;
    this.messages       = [];
    this.actions        = {};
  },
  
  isWaiting:  false,
  timeToWait: 1000,
  assertions: 0,
  failures:   0,
  errors:     0,
  isRunningFromRake: window.location.port == 4711,
  
  wait: function(time, nextPart) {
    this.isWaiting = true;
    this.test = nextPart;
    this.timeToWait = time;
  },
  
  run: function(rethrow) {
    try {
      try {
        if (!this.isWaiting) this.setup();
        this.isWaiting = false;
        this.test();
      } finally {
        if(!this.isWaiting) {
          this.teardown();
        }
      }
    }
    catch(e) { 
      if (rethrow) throw e;
      this.error(e, this); 
    }
  },
  
  summary: function() {
    var msg = '#{assertions} assertions, #{failures} failures, #{errors} errors\n';
    return msg.interpolate(this) + this.messages.join("\n");
  },

  pass: function() {
    this.assertions++;
  },
  
  fail: function(message) {
    this.failures++;
    var line = "";
    try {
      throw new Error("stack");
    } catch(e){
      line = (/\.html:(\d+)/.exec(e.stack || '') || ['',''])[1];
    }
    this.messages.push("Failure: " + message + (line ? " Line #" + line : ""));
  },
  
  info: function(message) {
    this.messages.push("Info: " + message);
  },
  
  error: function(error, test) {
    this.errors++;
    this.actions['retry with throw'] = function() { test.run(true) };
    this.messages.push(error.name + ": "+ error.message + "(" + Test.Unit.inspect(error) + ")");
  },
  
  status: function() {
    if (this.failures > 0) return 'failed';
    if (this.errors > 0) return 'error';
    return 'passed';
  },
  
  benchmark: function(operation, iterations) {
    var startAt = new Date();
    (iterations || 1).times(operation);
    var timeTaken = ((new Date())-startAt);
    this.info((arguments[2] || 'Operation') + ' finished ' + 
       iterations + ' iterations in ' + (timeTaken/1000)+'s' );
    return timeTaken;
  }
});
