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

 const path = require('path');

 module.exports = (RED) => {
    function checkConfig(node, conf) {
        if (!conf || !conf.hasOwnProperty('group')) {
            node.error(RED._('table.error.no-group'));
            return false;
        }
        else {
            return true;
        }
    }
    
    function HTML(config) {
        config.id = config.id.replace('.', '_');
        const configAsJson = JSON.stringify(config);
        const html = String.raw`
        <link href='ui-reef/css/uireef.css' rel='stylesheet' type='text/css'>
        <script type='text/javascript' src='ui-reef/js/highcharts.js'></script>
        <div class="probe-container" ng-init='init(${configAsJson})'>
            <div id="uiProbeChart_${config.id}" class="probe-chart"></div>
            <div class="probe-label">
                <div class="probe-name">${config.label}</div>
                <div class="probe-value">{{latestValue}}</div>
            </div>
        </div>
       `;
        return html;
    }

    let ui;

    function ProbeNode(config) {
        const node = this;
        try {
            if (checkConfig(node, config)) {
                if (ui === undefined) {
                    ui = RED.require('node-red-dashboard')(RED);
                }

                config.dark = false;
                if (typeof ui.isDark === 'function') {
                    config.dark = ui.isDark();
                    config.widgetColor = ui.getTheme()['widget-backgroundColor'].value;
                }

                RED.nodes.createNode(this, config);

                node.convertNum = (val) => {
                    if (val.toString().indexOf('.') !== -1) {
                        var lgth = val.toString().split('.')[0].length;
                        if (lgth <= 1) {
                            return val.toFixed(2);
                        } else if (lgth === 2) {
                            return val.toFixed(1);
                        } else if (lgth >= 3) {
                            return val.toFixed(0);
                        }
                    } else {
                        return val;
                    }
                };

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
                    convert: (value, oldValue, msg) => {
                        if (!oldValue) {
                            oldValue = { plot: [], value: 0 };
                        }
                        var time;
                        if (msg.timestamp !== undefined) { 
                            time = new Date(msg.timestamp).getTime(); 
                        } else { 
                            time = new Date().getTime();
                        }
                        var limitOffsetSec = parseInt(config.removeOlder) * parseInt(config.removeOlderUnit);
                        var limitTime = time - (limitOffsetSec * 1000);
                        if (Array.isArray(value)) {
                            var flag = false;
                            if (value.length === 0) {
                                value = [];
                            } else if (Array.isArray(value[0])) {
                                if (value[0].length !== 2) { flag = true; }
                            } else if (!value[0].hasOwnProperty("x") && !value[0].hasOwnProperty("y")) {
                                flag = true;
                            } else {
                                flag = true;
                            }
                            if (flag) {
                                node.warn("Bad data inject");
                                return;
                            } else {
                                oldValue.plot = value;
                            }
                        } else {
                            if (value !== null) {
                                value = parseFloat(value);
                                if (isNaN(value)) {
                                    node.warn("Bad data inject");
                                    return;
                                }
                            }
                            if (time >= limitTime) {
                                var point = { "x":time, "y":value };
                                oldValue.plot.push(point);
                            }
                        }
                        var tmp = [];
                        var latestValue = 0;
                        for (var u = 0; u < oldValue.plot.length; u++) {
                            if (oldValue.plot[u][0] >= limitTime || oldValue.plot[u].x >= limitTime) { 
                                tmp.push(oldValue.plot[u]);
                            }
                            if (oldValue.plot[u][0] > latestValue || oldValue.plot[u].x >=latestValue) { 
                                latestValue = (oldValue.plot[u].hasOwnProperty('y')) ? oldValue.plot[u].y : oldValue.plot[u][1];
                            }
                        }
                        oldValue.plot = tmp;
                        oldValue.value = node.convertNum(latestValue);;
                        value = oldValue;
                        return value;
                    },
                    beforeEmit(msg, value) {
                        return { msg: {
                            payload: value,
                            socketid: msg.socketid
                        }};
                    },
                    initController: ($scope) => {
                        $scope.flag = true;
                        $scope.chartDiv;
                        $scope.init = (config) => {
                            $scope.config = config;
                            $scope.unique = $scope.$eval('$id');
                            $scope.latestValue = 0;
                            $scope.chartDiv = new Highcharts.chart('uiProbeChart_' + $scope.config.id, {
                                chart: {
                                    type: 'spline',
                                    backgroundColor: '#EAF4FA',
                                },
                                title: {
                                    text: ''
                                },
                                subtitle: {
                                    text: ''
                                },
                                xAxis: {
                                    visible: false,
                                    type: 'datetime',
                                },
                                yAxis: {
                                    visible: false,
                                    startOnTick: false,
                                    endOnTick: false,
                                    maxPadding: 0.01,
                                },
                                tooltip: {
                                    xDateFormat: '%m-%d-%Y',
                                    pointFormat: '{point.y:.2f}',
                                },
                                legend: {
                                    enabled: false,
                                },
                                credits: {
                                    enabled: false,
                                },
                                plotOptions: {
                                    series: {
                                        lineColor: '#0094CE',
                                        marker: {
                                            enabled: false,
                                        },
                                    },
                                },
                                series: [{}],
                                exporting: {
                                    enabled: false,
                                }
                            });
                            $scope.chartDiv.reflow();
                        };

                        $scope.$watch('msg', (msg) => {
                            if (msg) {
                                $scope.chartDiv.series[0].setData(msg.payload.plot, true);
                                $scope.chartDiv.reflow();
                                $scope.latestValue = msg.payload.value;
                            }
                        });
                    },
                });

                node.on('close', () => {
                    done();
                });
            }
        } catch (e) {
            node.error(e);
        }
    }
    RED.nodes.registerType('ui_probe', ProbeNode);

    const uipath = RED.settings.ui.path || 'ui';
    const fullPath = path.join(RED.settings.httpNodeRoot, uipath, '/ui-reef/*').replace(/\\/g, '/');

    RED.httpNode.get(fullPath, function (req, res) {
        var options = {
            root: __dirname + '/lib/',
            dotfiles: 'deny'
        };
        res.sendFile(req.params[0], options)
    });
};
