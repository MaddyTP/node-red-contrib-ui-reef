/* eslint-disable import/no-dynamic-require */
/**
 * Copyright 2021 Bart Butenaers & hotNipi
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * */
const util = require('util');
const vm = require('vm');
const npm = require('npm');
const strip = require('strip-comments');
const { npmInstallTo } = require('npm-install-to');
const temp = require('temp').track();

module.exports = (RED) => {
  function HTML(config) {
    delete config.func;
    config.id = config.id.replace('.', '_');
    const configAsJson = JSON.stringify(config);
    const html = String.raw`
      <style>
          .multistate-switch-container{
              display: block;
              width:100%;
              margin:auto;
              padding: 3px;
          }
          .multistate-switch-header{
              display: flex;
                justify-content: space-between;
              font-size: 14px;
              font-weight: 500;
              letter-spacing: .1em;
              text-transform: uppercase;
              margin: 0.1em;
              padding-left: 2px;
              padding-right: 2px;
          }
          .multistate-switch-config{
              color: #999;
              cursor: pointer;
          }
          .multistate-switch-wrapper.disabled{
              border-color:gray;
              border-style:dashed;
          }
          .multistate-switch-wrapper{
              border:1px solid var(--nr-dashboard-widgetColor);
              display: flex;
              flex-flow: column nowrap;
              justify-content: center;
              align-items: center;
              position:relative;
              font-size: 14px;
              font-weight: 425;
              letter-spacing: .06em;
              text-transform: uppercase;
              margin: auto 0;
              width:100%;
              height: 1.55em;
          }
          .multistate-slider-wrapper.disabled{
              opacity:0.5;
          }
          .multistate-slider-wrapper{
              height: 1em;
              padding-top: 0.25em;
              padding-bottom: 0.25em;
              z-index:0
          }
          .multistate-switch-body.disabled{
              color:gray;
              pointer-events:none; 
          }
          .multistate-switch-body{
              pointer-events:auto;
              display: inline-flex;
              justify-content: flex-start;
              width: 100%;
          }
          .multistate-switch-slider-${config.id}{
              width: calc((100% - (${config.options.length} * 0.2em)) / ${config.options.length});
          }
          .multistate-switch-slider{                
              background-color: var(--nr-dashboard-widgetColor);
              position: absolute;
              height: 1.2em;
              transform: translate(0.1em, -0.25em);
              transition: all .4s ease;
              left: 0%;
              z-index:0;
          }
          .multistate-switch-button-${config.id}{
              width:calc(100% / ${config.options.length}); 
          }
          .multistate-switch-button.disabled{
              pointer-events:none !important;
          }
          .multistate-switch-button.dark{
              color:var(--nr-dashboard-widgetBgndColor)
          }
          .multistate-switch-button.light{
              color:var(--nr-dashboard-widgetTextColor)
          }
          .multistate-switch-button{
             text-align:center;
             z-index:1;
             outline: none;
             user-select:none;
             cursor:pointer;
             line-height: 1.2em;
             transition: color 0.5s ease;
          }
          .multistate-switch-round{
              border-radius: 0.8em;
          }
      </style>
      <div class="multistate-switch-container" ng-init='init(${configAsJson})'>
          <div ng-if="${config.label !== ''}" class="multistate-switch-header">
              <div>${config.label}</div>
              <div>
                  <span>{{inputState}}</span>
                  <i class="fa fa-cog multistate-switch-config"></i>
              </div>
          </div>
          <div id="multiStateSwitchContainer_${config.id}" class="multistate-switch-wrapper multistate-switch-round">
              <div id="multiStateSwitchBody_${config.id}"" class="multistate-switch-body">
                  <div id="multiStateSwitchSliderWrapper_${config.id}" class="multistate-slider-wrapper">
                      <div id="multiStateSwitchSlider_${config.id}" class="multistate-switch-slider multistate-switch-round multistate-switch-slider-${config.id}"></div>
                  </div>
                  <!-- The radio buttons will be inserted here dynamically on the frontend side -->
              </div>
          </div>
      </div>
      `;

    return html;
  }

  function createVMOpt(node, kind) {
    const opt = {
      filename: `Function node${kind}:${node.id}${node.name ? ` [${node.name}]` : ''}`,
      displayErrors: true,
    };
    return opt;
  }

  function updateErrorInfo(err) {
    if (err.stack) {
      const stack = err.stack.toString();
      const m = /^([^:]+):([^:]+):(\d+).*/.exec(stack);
      if (m) {
        const line = parseInt(m[3], 10) - 1;
        let kind = 'body:';
        if (/setup/.exec(m[1])) {
          kind = 'setup:';
        }
        if (/cleanup/.exec(m[1])) {
          kind = 'cleanup:';
        }
        err.message += ` (${kind}line ${line})`;
      }
    }
  }

  let ui;

  function OutletNode(config) {
    this.interval_id = null;
    this.repeat = config.repeat * 1000;
    const node = this;
    node.name = config.name;
    node.func = config.func;
    node.outstandingTimers = [];
    node.outstandingIntervals = [];
    node.clearStatus = false;

    try {
      if (ui === undefined) {
        ui = RED.require('node-red-dashboard')(RED);
      }

      config.dark = false;
      if (typeof ui.isDark === 'function') {
        config.dark = ui.isDark();
        config.widgetColor = ui.getTheme()['widget-backgroundColor'].value;
      }

      RED.nodes.createNode(this, config);

      const sandbox = {
        console,
        util,
        Buffer,
        Date,
        RED: {
          util: RED.util,
        },
        __node__: {
          id: node.id,
          name: node.name,
          log: (...args) => {
            node.log(...args);
          },
          error: (...args) => {
            node.error(...args);
          },
          warn: (...args) => {
            node.warn(...args);
          },
          debug: (...args) => {
            node.debug(...args);
          },
          trace: (...args) => {
            node.trace(...args);
          },
          status: (...args) => {
            node.clearStatus = true;
            node.status(...args);
          },
        },
        context: {
          set: (...args) => {
            node.context().set(...args);
          },
          get: (...args) => node.context().get(...args),
          keys: (...args) => node.context().keys(...args),
          get global() {
            return node.context().global;
          },
          get flow() {
            return node.context().flow;
          },
        },
        flow: {
          set: (...args) => {
            node.context().flow.set(...args);
          },
          get: (...args) => node.context().flow.get(...args),
          keys: (...args) => node.context().flow.keys(...args),
        },
        global: {
          set: (...args) => {
            node.context().global.set(...args);
          },
          get: (...args) => node.context().global.get(...args),
          keys: (...args) => node.context().global.keys(...args),
        },
        env: {
          get: (envVar) => {
            const flow = node._flow;
            return flow.getSetting(envVar);
          },
        },
        setTimeout: (...args) => {
          const func = args[0];
          let timerId;
          args[0] = () => {
            sandbox.clearTimeout(timerId);
            try {
              func(...args);
            } catch (err) {
              node.error(err, {});
            }
          };
          timerId = setTimeout(...args);
          node.outstandingTimers.push(timerId);
          return timerId;
        },
        clearTimeout: (id) => {
          clearTimeout(id);
          const index = node.outstandingTimers.indexOf(id);
          if (index > -1) {
            node.outstandingTimers.splice(index, 1);
          }
        },
        setInterval: (...args) => {
          const func = args[0];
          args[0] = () => {
            try {
              func(...args);
            } catch (err) {
              node.error(err, {});
            }
          };
          const timerId = setInterval(...args);
          node.outstandingIntervals.push(timerId);
          return timerId;
        },
        clearInterval: (id) => {
          clearInterval(id);
          const index = node.outstandingIntervals.indexOf(id);
          if (index > -1) {
            node.outstandingIntervals.splice(index, 1);
          }
        },
      };

      if (Object.prototype.hasOwnProperty.call(util, 'promisify')) {
        sandbox.setTimeout[util.promisify.custom] = (after, value) => new Promise((resolve) => {
          sandbox.setTimeout(() => { resolve(value); }, after);
        });
        sandbox.promisify = util.promisify;
      }

      const funcText = `
                    (function() {
                        var node = {
                            id:__node__.id,
                            name:__node__.name,
                            log:__node__.log,
                            error:__node__.error,
                            warn:__node__.warn,
                            debug:__node__.debug,
                            trace:__node__.trace,
                            status:__node__.status,
                        };
                        ${node.func}
                    })(__funcSend__);`;

      const tempDir = temp.mkdirSync();
      const tempNodeModulesPath = `${tempDir}/node_modules/`;
      const requiredModules = [];
      const installedModules = {};
      const npmModules = {};
      const RE_SCOPED = /^(@[^/]+\/[^/@]+)(?:\/([^@]+))?(?:@([\s\S]+))?/;
      const RE_NORMAL = /^([^/@]+)(?:\/([^@]+))?(?:@([\s\S]+))?/;
      const pattern = /require\(([^)]+)\)/g;
      const functionTextwoComments = strip(funcText);
      let result = pattern.exec(functionTextwoComments);

      while (result !== null) {
        let moduleName = result[1];
        moduleName = moduleName.replace(/'/g, '');
        moduleName = moduleName.replace(/"/g, '');
        const matched = moduleName.charAt(0) === '@' ? moduleName.match(RE_SCOPED) : moduleName.match(RE_NORMAL);
        const moduleNameOnly = matched[1];
        const modulePath = matched[2] || '';
        const moduleVersion = matched[3] || '';
        requiredModules.push({
          name: moduleNameOnly,
          path: modulePath,
          version: moduleVersion,
          fullName: moduleName,
        });
        result = pattern.exec(functionTextwoComments);
      }

      const setStatus = (errors, itemsProcessed) => {
        if (itemsProcessed === requiredModules.length) {
          if (errors.length === 0) {
            node.status({ fill: 'green', shape: 'dot', text: 'ready' });
            setTimeout(node.status.bind(node, {}), 5000);
          } else {
            let msg = `${errors.length.toString()} package(s) installations failed.`;
            errors.forEach((e) => {
              msg = `${msg}\r\n${e.moduleName}`;
            });
            node.status({ fill: 'red', shape: 'dot', text: msg });
          }
        }
      };

      const errors = [];
      let itemsProcessed = 0;

      requiredModules.forEach((npmModule) => {
        const moduleFullPath = npmModule.path === '' ? tempNodeModulesPath + npmModule.name : tempNodeModulesPath + npmModule.path;
        if (installedModules[npmModule.fullName]) {
          npmModules[npmModule.fullName] = require(moduleFullPath);
          itemsProcessed += 1;
        } else {
          node.status({ fill: 'blue', shape: 'dot', text: 'installing packages' });
          npm.load({ prefix: tempDir, progress: false, loglevel: 'silent' }, (er) => {
            if (er) {
              errors.push({ moduleName: npmModule.fullName, error: er });
              itemsProcessed += 1;
              setStatus(errors, itemsProcessed);
              return node.error(er);
            }
            npmInstallTo(tempDir, [npmModule.fullName]).then(() => {
              try {
                npmModules[npmModule.fullName] = require(moduleFullPath);
                node.log(`Downloaded and installed NPM module: ${npmModule.fullName}`);
                installedModules[npmModule.fullName] = true;
              } catch (err) {
                installedModules[npmModule.fullName] = false;
                errors.push({ moduleName: npmModule.fullName, error: err });
                node.error(err);
              }
            }).catch((err) => {
              installedModules[npmModule.fullName] = false;
              errors.push({ moduleName: npmModule.fullName, error: er });
              setStatus(errors, itemsProcessed);
              return node.error(err);
            }).then(() => {
              itemsProcessed += 1;
              setStatus(errors, itemsProcessed);
            });
          });
        }
      }, this);

      // var checkPackageLoad = function () {
      //     var downloadProgressResult = null;
      //     if (requiredModules.length != 0) {
      //         requiredModules.forEach(function (npmModule) {
      //             if (!(installedModules.hasOwnProperty(npmModule.fullName))) {
      //                 downloadProgressResult = false;
      //             } else {
      //                 downloadProgressResult = (downloadProgressResult !== null) ? (downloadProgressResult && true) : true
      //             }
      //         }, this);
      //     } else {
      //         downloadProgressResult = true;
      //     }
      //     return downloadProgressResult;
      // };

      const requireOverload = (moduleName) => {
        try {
          return npmModules[moduleName];
        } catch (err) {
          node.error(`Cannot find module : ${moduleName}`);
        }
      };

      sandbox.__npmModules__ = npmModules;
      sandbox.require = requireOverload;

      const context = vm.createContext(sandbox);
      let funcOpt;
      let funcScript;

      if (node.func && node.func !== '') {
        funcOpt = createVMOpt(node, '');
        funcScript = new vm.Script(funcText, funcOpt);
        context.__funcSend__ = () => {};
      }

      node.repeaterSetup = (stateField) => {
        if (this.repeat && !Number.isNaN(this.repeat) && this.repeat > 0 && funcScript !== '' && this.interval_id === null) {
          this.interval_id = setInterval(() => {
            const newMsg = {};
            const newValue = funcScript.runInContext(context, funcOpt);
            RED.util.setMessageProperty(newMsg, stateField, newValue, true);
            node.send(newMsg);
          }, this.repeat);
          node.outstandingIntervals.push(this.interval_id);
        }
      };

      node.cancelRepeater = () => {
        clearInterval(this.interval_id);
        this.interval_id = null;
      };

      config.initOpt = node.context().get('state');
      if (config.initOpt === undefined) {
        config.initOpt = config.options[0];
      }

      if (config.initOpt.valueType === 'func' && node.func && node.func !== '') {
        node.repeaterSetup(config.stateField);
      }

      const html = HTML(config);
      const done = ui.addWidget({
        node,
        group: config.group,
        order: config.order,
        width: config.width,
        height: config.height,
        format: html,
        templateScope: 'local',
        emitOnlyNewValues: false,
        forwardInputMessages: false,
        storeFrontEndInputAsState: true,
        convertBack(value) {
          return value;
        },
        beforeEmit(msg) {
          if (msg) {
            const newMsg = {};
            newMsg.socketid = msg.socketid;
            newMsg.state = RED.util.getMessageProperty(msg, config.stateField || 'payload');
            newMsg.input = RED.util.getMessageProperty(msg, config.inputField || 'input');
            return { msg: newMsg };
          }
          return msg;
        },
        beforeSend(msg, orig) {
          if (orig) {
            const newMsg = {};
            let newValue = null;
            if (orig.msg.option.valueType === 'func') {
              if (node.func && node.func !== '') {
                newValue = funcScript.runInContext(context, funcOpt);
                RED.util.setMessageProperty(newMsg, config.stateField, newValue, true);
                node.repeaterSetup(config.stateField);
              }
            } else {
              node.cancelRepeater();
              newValue = orig.msg.state;
              RED.util.setMessageProperty(newMsg, config.stateField, newValue, true);
            }
            if (config.storestate) {
              node.context().set('state', orig.msg.option);
            }
            return newMsg;
          }
          return msg;
        },
        initController: ($scope) => {
          $scope.flag = true;
          $scope.init = (config) => {
            $scope.config = config;
            $scope.containerDiv = $(`#multiStateSwitchContainer_${config.id}`)[0];
            $scope.sliderDivElement = $(`#multiStateSwitchSlider_${config.id}`)[0];
            $scope.sliderWrapperElement = $(`#multiStateSwitchSliderWrapper_${config.id}`)[0];
            // Get a reference to the sub-DIV element
            const toggleRadioDiv = $scope.containerDiv.firstElementChild;
            // Create all the required  button elements
            config.options.forEach((option, index) => {
              const divElement = document.createElement('div');
              divElement.setAttribute('class', `multistate-switch-button multistate-switch-button-${config.id}`);
              divElement.setAttribute('id', `mstbtn_${config.id}_${index}`);
              divElement.innerHTML = option.label;
              divElement.addEventListener('click', () => {
                switchStateChanged(option.value, true);
              });
              toggleRadioDiv.appendChild(divElement);
            });
            // Make sure the initial element gets the correct color
            switchStateChanged(config.initOpt.value, false);
          };

          $scope.$watch('msg', (msg) => {
            if (!msg) {
              return;
            }
            if (msg.state !== undefined) {
              switchStateChanged(msg.state.toString(), false);
            }
            if (msg.input !== undefined) {
              $scope.inputState = msg.input;
            }
          });

          const txtClassToStandOut = (bgColor, light, dark) => {
            const color = (bgColor.charAt(0) === '#') ? bgColor.substring(1, 7) : bgColor;
            const r = parseInt(color.substring(0, 2), 16);
            const g = parseInt(color.substring(2, 4), 16);
            const b = parseInt(color.substring(4, 6), 16);
            const uicolors = [r / 255, g / 255, b / 255];
            const c = uicolors.map((col) => {
              if (col <= 0.03928) {
                return col / 12.92;
              }
              return Math.pow((col + 0.055) / 1.055, 2.4);
            });
            const L = (0.2126 * c[0]) + (0.7152 * c[1]) + (0.0722 * c[2]);
            if ($scope.config.dark) {
              return (L > 0.35) ? dark : light;
            }
            return (L > 0.35) ? light : dark;
          };

          const switchStateChanged = (newValue, sendMsg) => {
            let divIndex = -1;
            const newMsg = {};
            // Try to find an option with a value identical to the specified value
            // For every button be sure that button exists and change mouse cursor and pointer-events
            $scope.config.options.forEach((option, index) => {
              if ($(`#mstbtn_${$scope.config.id}_${index}`).length) {
                $(`#mstbtn_${$scope.config.id}_${index}`).css({ cursor: 'pointer', 'pointer-events': 'auto' });
                $(`#mstbtn_${$scope.config.id}_${index}`).removeClass('light dark');
                if (option.value === newValue) {
                  $(`#mstbtn_${$scope.config.id}_${index}`).css({ cursor: 'default', 'pointer-events': 'none' });
                  const color = $scope.config.useThemeColors ? $scope.config.widgetColor : option.color ? option.color : $scope.config.widgetColor;
                  $(`#mstbtn_${$scope.config.id}_${index}`).addClass(txtClassToStandOut(color, 'light', 'dark'));
                  divIndex = index;
                }
              }
            });
            if (divIndex >= 0) {
              let percentage = '0%';
              newMsg.option = $scope.config.options[divIndex];
              if ($scope.config.options.length > 0 && divIndex >= 0) {
                percentage = (100 / $scope.config.options.length) * divIndex;
                $scope.sliderDivElement.style.left = `${percentage}%`;
                if ($scope.config.useThemeColors !== true) {
                  $scope.sliderDivElement.style.backgroundColor = $scope.config.options[divIndex].color;
                }
              }
              if ($scope.config.options[divIndex].valueType === 'str') {
                newMsg.state = newValue;
              }
              if ($scope.config.options[divIndex].valueType === 'num') {
                newValue = Number(newValue);
                newMsg.state = newValue;
              }
              if ($scope.config.options[divIndex].valueType === 'bool') {
                if (newValue === 'true') {
                  newValue = true;
                } else {
                  newValue = false;
                }
                newMsg.state = newValue;
              }
              if ($scope.config.options[divIndex].valueType === 'func') {
                newMsg.state = newValue;
              }
              if (sendMsg) {
                $scope.send(newMsg);
              }
            } else {
              console.log(`No radio button has value '${newValue}'`);
            }
          };
        },
      });

      node.on('close', () => {
        while (node.outstandingTimers.length > 0) {
          clearTimeout(node.outstandingTimers.pop());
        }
        while (node.outstandingIntervals.length > 0) {
          clearInterval(node.outstandingIntervals.pop());
        }
        if (node.clearStatus) {
          node.status({});
        }
        done();
      });
    } catch (e) {
      node.error(e);
      console.trace(e);
      updateErrorInfo(e);
    }
  }
  RED.nodes.registerType('outlet', OutletNode);
  RED.library.register('functions');
};
