import giturl from "git-url-parse";

import _ from "lodash";
import Table from "cli-table2";

import pkg from "../package.json";
import rpt from "./promise/read-package-tree";

class CompareModel {
    constructor(a) {
        [this.name, this.current, this.wanted, this.latest] = a;
        this.repo = "";
        this.homepage = "";
    }

    rangeWanted() {
        return this.versionRange(this.wanted);
    }

    rangeLatest() {
        return this.versionRange(this.latest);
    }

    versionRange(to) {
        if (this.current === to) {
            return `v${this.current}`;
        }
        return `v${this.current}...v${to}`;
    }

    diffWantedURL() {
        return this.diffURL(this.wanted);
    }

    diffLatestURL() {
        return this.diffURL(this.latest);
    }

    diffURL(to) {
        if (this.repo) {
            if (this.current === to) {
                return `${this.repo}/tree/v${this.current}`;
            }
            return `${this.repo}/compare/${this.versionRange(to)}`;
        }
        return "";
    }
}

function toCompareModels(cwd, diff) {
    let map = new Map(diff.map(d => {
        let c = new CompareModel(d);
        return [c.name, c];
    }));
    return rpt(cwd, (n, k) => map.get(k)).then(data => {
        data.children.forEach(e => {
            let pkg = e.package;
            let c = map.get(pkg.name);
            c.homepage = pkg.homepage;
            if (pkg.repository) {
                if (pkg.repository.url) {
                    let u = giturl(pkg.repository.url);
                    c.repo = u && u.toString("https");
                }
                if (_.isString(pkg.repository) && 2 === pkg.split("/")) {
                    c.repo = `https://github.com/${pkg.repository}`;
                }
            }
        });
        return [data.package, map];
    });
}

class Column {
    constructor(name, layout, render, simpleLayout, simpleRender) {
        this.name = name;
        this.layout = layout;
        this.render = render;
        this.simpleLayout = simpleLayout;
        this.simpleRender = simpleRender;
    }
}

function makeColumns(rootDef, map) {
    let columns = [];
    columns.push(new Column("Name", ":---- ", cw => {
        return cw.homepage ? `[${cw.name}](${cw.homepage})` : cw.name;
    }, "right", cw => cw.name));
    columns.push(new Column("Updating", ":--------:", cw => {
        return cw.repo ? `[${cw.rangeWanted()}](${cw.diffWantedURL()})` : cw.rangeWanted();
    }, "center", cw => cw.rangeWanted()));
    columns.push(new Column("Latest", ":------:", cw => {
        return cw.repo ? `[v${cw.latest}](${cw.diffLatestURL()})` : `v${cw.latest}`;
    }, "center", cw => `v${cw.latest}`));
    let depnames = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies", "bundledDependencies"];
    depnames.forEach(n => {
        let deps = rootDef[n];
        if (deps && Array.from(map.keys()).find(k => deps[k])) {
            let fn = cw => deps[cw.name] ? "*" : " ";
            columns.push(new Column(n, ":-:", fn, "center", fn));
        }
    });

    return columns;
}

function headers(columns) {
    let a = columns.map(col => col.name);
    return "| " + a.join(" | ") + " |";
}

function layouts(columns) {
    let a = columns.map(col => col.layout);
    return "|" + a.join("|") + "|";
}

function rows(columns, entries) {
    return entries.map(c => {
        let a = columns.map(col => col.render(c));
        return "| " + a.join(" | ") + " |";
    }).join("\n");
}

function toMarkdown([rootDef, map]) {
    let columns = makeColumns(rootDef, map);
    let entries = Array.from(map.values());
    return `## Updating Dependencies

${headers(columns)}
${layouts(columns)}
${rows(columns, entries)}

Powered by [${pkg.name}](${pkg.homepage})`;
}

function toTextTable([rootDef, map]) {
    let columns = makeColumns(rootDef, map);
    let entries = Array.from(map.values());
    let t = new Table({
        head: columns.map(col => col.name),
        chars: {
            "top": "=", "top-mid": "=", "top-left": "", "top-right": ""
            , "bottom": "=", "bottom-mid": "=", "bottom-left": "", "bottom-right": ""
            , "left": "", "left-mid": "", "mid": "-", "mid-mid": "-"
            , "right": "", "right-mid": "", "middle": "|"
        },
        colAligns: columns.map(col => col.simpleLayout),
        style: {
            head: [],
            "padding-left": 1,
            "padding-right": 1
        }
    });

    entries.forEach(c => {
        t.push(columns.map(col => col.simpleRender(c)));
    });
    return t.toString();
}

// for tesing purpose
export const __test__ = [CompareModel, toMarkdown, toTextTable];

export function markdownView(cwd, diff) {
    return toCompareModels(cwd, diff).then(toMarkdown);
}

export function simpleView(cwd, diff) {
    return toCompareModels(cwd, diff).then(toTextTable);
}
