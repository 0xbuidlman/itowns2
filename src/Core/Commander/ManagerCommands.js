/**
 * Generated On: 2015-10-5
 * Class: ManagerCommands
 * Description: Cette classe singleton gère les requetes/Commandes  de la scène. Ces commandes peuvent etre synchrone ou asynchrone. Elle permet d'executer, de prioriser  et d'annuler les commandes de la pile. Les commandes executées sont placées dans une autre file d'attente.
 */

import EventsManager from 'Core/Commander/Interfaces/EventsManager';
import PriorityQueue from 'PriorityQueue';

var instanceCommandManager = null;

function ManagerCommands(scene) {
    //Constructor
    if (instanceCommandManager !== null) {
        throw new Error("Cannot instantiate more than one ManagerCommands");
    }

    this.queueAsync = new PriorityQueue({
        comparator: function(a, b) {
            var cmp = b.priority - a.priority;
            // Prioritize recent commands
            if (cmp === 0) {
                return b.timestamp - a.timestamp;
            }
            return cmp;
        }
    });

    this.queueSync = null;
    this.loadQueue = [];
    this.providers = {};
    this.history = null;
    this.eventsManager = new EventsManager();
    this.maxConcurrentCommands = 16;
    this.maxCommandsPerHost = 6;
    this.counters = {
        runningCommands: 0,
        executedCommands: 0,
        hostCommands: {}
    };

    if (!scene)
        throw new Error("Cannot instantiate ManagerCommands without scene");

    this.scene = scene;

}

ManagerCommands.prototype.constructor = ManagerCommands;

ManagerCommands.prototype.addCommand = function(command) {
    this.queueAsync.queue(command);
    this.executeCommands();
};


ManagerCommands.prototype.addProtocolProvider = function(protocol, provider) {
    this.providers[protocol] = provider;
};

ManagerCommands.prototype.getProtocolProvider = function(protocol) {
    return this.providers[protocol];
};

ManagerCommands.prototype.commandsLength = function() {
    return this.queueAsync.length;
};

ManagerCommands.prototype.isFree = function() {
    return this.commandsLength() === 0;
};

ManagerCommands.prototype.resetExecutedCommandsCount = function() {
    this.counters.executedCommands = 0;
};

ManagerCommands.prototype.executeCommands = function() {

    var command;
    var launchCommand = function(cmd) {
        this.counters.runningCommands++;
        var layer = cmd.layer;
        var host;
        if(layer.url) {
            host = new URL(layer.url).host;
            if(this.counters.hostCommands[host] === undefined) {
                this.counters.hostCommands[host] = 1;
            } else {
                this.counters.hostCommands[host]++;
            }
        }

        var commandEnd = function() {
            this.counters.runningCommands--;
            this.counters.executedCommands++;
            if(host) {
                this.counters.hostCommands[host]--;
                if(this.counters.hostCommands[host] === 0) {
                    this.counters.hostCommands[host] = undefined;
                }
            }
            this.executeCommands();
        }.bind(this);

        var p = this.providers[layer.protocol];
        if(p) {
            var promise = p.executeCommand(cmd);
            if(promise) {
                promise.then(function() {
                    commandEnd();
                }.bind(this));
            } else {
                commandEnd();
            }
        } else {
            commandEnd();
        }
    }.bind(this);

    var skippedCommands = [];
    // Launch awaiting commands until max concurrent command count is reached
    while(this.counters.runningCommands != this.maxConcurrentCommands) {
        command = this.deQueue();
        if(command === undefined) {
            break;
        }

        // Skip command if max commands per host is exceeded
        var url = command.layer.url;
        if(url) {
            var host = new URL(url).host;
            if(this.counters.hostCommands[host] !== undefined &&
                this.maxCommandsPerHost <= this.counters.hostCommands[host]) {
                skippedCommands.push(command);
                continue;
            }
        }
        launchCommand(command);
    }

    // Requeue skipped commands
    for(var i = 0; i < skippedCommands.length; i++) {
        this.queueAsync.queue(skippedCommands[i]);
    }

    return this.counters.runningCommands === 0 && this.counters.executedCommands === 0;
};


ManagerCommands.prototype.getProviders = function() {
    var p = [];

    for (var protocol in this.providers) {
        p.push(this.providers[protocol]);
    }
    return p;
};



/**
 */
ManagerCommands.prototype.deQueue = function() {

    while (this.queueAsync.length > 0) {
        var cmd = this.queueAsync.peek();

        if (cmd.earlyDropFunction && cmd.earlyDropFunction(cmd)) {
            this.queueAsync.dequeue();
            cmd.reject(new Error('command canceled ' + cmd.requester.id + '/' + cmd.layer.id));
        } else {
            return this.queueAsync.dequeue();
        }

    }

    return undefined;
};

/**
 */
ManagerCommands.prototype.removeCanceled = function() {
    //TODO: Implement Me

};

/**
 */
ManagerCommands.prototype.wait = function() {
    //TODO: Implement Me
    this.eventsManager.wait();
};

/**
 */
ManagerCommands.prototype.forecast = function() {
    //TODO: Implement Me

};

/**
 * @param object
 */
ManagerCommands.prototype.addInHistory = function( /*object*/ ) {
    //TODO: Implement Me

};

export default function(scene) {
    instanceCommandManager = instanceCommandManager || new ManagerCommands(scene);
    return instanceCommandManager;
}
