# node-red-contrib-ui-reef

[![platform](https://img.shields.io/badge/platform-Node--RED-red)](https://nodered.org)


This set of Node-Red nodes are inteded to be used to create an interactive dashboard for reef and freshwater aquarium controllers.  These nodes are designed to work specifically with Node-Red-Dashboard (min v2.10.0) which must be installed first.


![image](https://user-images.githubusercontent.com/45469378/146694931-4b29cefe-bff7-48d8-b2ff-3cca6dedfff5.png)


## Install

Either use the Manage Palette option in the Node-RED Editor menu, or run the following command in your Node-RED user directory - typically `~/.node-red`

```javascript
npm install --unsafe-perm node-red-contrib-ui-reef
```

## Probe


![image](https://user-images.githubusercontent.com/45469378/146694968-1ff84c32-0ac8-4483-bc17-e7087a5569cc.png)


Probe accepts two types of data, live data and stored data.  Live data can be fed via `msg.payload` or stored data via an array of objects with an `x` and `y` property:

Live data:
```javascript
msg = { payload: 8.15 }
```

Stored data:
```javascript
[
    { x: 1520527095000, y: 8.15 },
    { x: 1520934095000, y: 8.17 }
]
```

When providing data for the time scale, this node uses timestamps defined as milliseconds since the epoch (midnight January 1, 1970, UTC) internally. However, it will also accept most datetime formats by way of the included chartjs-adapter-moment plugin.  

Value on the right will show most recent datapoint whether that be live data or stored data.  If a symbol is specified it will be appended to this value only.

**Options:**  
Timeframe: sets the timeframe for data to be displayed in chart.  
Rounding: rounds input value to specified decimal places.  
Symbol: appends specified symbol to most recent value.  
Map value to range: maps input values to specified range.  

## Output


![image](https://user-images.githubusercontent.com/45469378/146694977-60294bd5-ef14-4466-bfb1-3784107c5538.png)


Output node is a highly modified fork of [node-red-contrib-ui-multistate-switch](https://github.com/bartbutenaers/node-red-contrib-ui-multistate-switch) and the Node-Red Function node.  In essence, it's a modified combination allowing for a function to be run on a set interval instead of on incoming `msg`.

Incoming messages which have a valid `topic` and `payload` will be stored in the node's context for use in the function.  Switch options with static or non-function values can be added in conjunction with one function option.  

**Options:**  
Restore: on Node-red restart, restores switch value from context.  Only works if context is stored in "localfilesystem".  
Colors: allows specific colors to be set for switch options.  

## Input


![image](https://user-images.githubusercontent.com/45469378/146695082-7d691a09-d58b-4a04-9737-af2f5fafc4c8.png)


Input node is a modified fork of [node-red-contrib-ui-multistate-switch](https://github.com/bartbutenaers/node-red-contrib-ui-multistate-switch) which sets switch based on input value.  

**Options:**  
Colors: allows specific colors to be set for switch options.  
Input: allows `msg` property to be specified.  

## Important Note

These nodes would not be possible without the work of the following:

* barbutenaers / hotNipi - [node-red-contrib-ui-multistate-switch](https://github.com/bartbutenaers/node-red-contrib-ui-multistate-switch)
* Node-Red Team - Function node
* Node-Red-Dashboard Team - Chart node
