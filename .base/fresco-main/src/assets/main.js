const URL_APP_BASE = "/addons/";

const CONTENT_REVISION = "?rel=1659090883";

const URL_CONTENT = "/addons-content/";
const URL_CONTENT_METADATA = URL_CONTENT + "metadata.json" + CONTENT_REVISION;
const URL_CONTENT_LICENSES = URL_CONTENT + "licenses.json" + CONTENT_REVISION;
const URL_CONTENT_RELEASES = URL_CONTENT + "releases";

const URL_GITHUB_API = "https://api.github.com/repos/";
const URL_GITHUB = "https://github.com/";
const URL_LICENSE = "https://opensource.org/licenses/";

const APP_NAME = "Fresco";
const APP_VERSION = "0.0.1a4";
const APP_NAV = [
    {
        id: "all",
        label: "All",
        url: URL_APP_BASE
    },
    {
        id: "extensions",
        label: "Extensions",
        url: URL_APP_BASE + "?category=extensions&page=1"
    },
    {
        id: "themes",
        label: "Themes",
        url: URL_APP_BASE + "?category=themes&page=1"
    },
    {
        id: "dictionaries",
        label: "Dictionaries",
        url: URL_APP_BASE + "?category=dictionaries&page=1"
    },
    {
        id: "language-packs",
        label: "Language Packs",
        url: URL_APP_BASE + "?category=language-packs&page=1"
    }
];

const CONTENT_TYPE_XPI = "application/x-xpinstall";

const MIRROR_PHOEBUS_PM = "https://addons.palemoon.org/addon/";
const MIRROR_PHOEBUS_BK = "https://addons.basilisk-browser.org/addon/";
const MIRROR_PHOEBUS_IN = "https://interlink-addons.binaryoutcast.com/addon/";
const MIRROR_PHOEBUS_ES = "https://addons.epyrus.org/addon/";
const MIRROR_AMO = "https://addons.mozilla.org/en-US/firefox/addon/";

const LIST_MAX_ITEMS = 25;

var gAppInfo = {
    identify: function () {
        var ua = navigator.userAgent;
        this.isGRE = /Goanna/.test(ua) && InstallTrigger;

        var match = /(PaleMoon|Basilisk|Interlink|Borealis|Epyrus)\/([^\s]*).*$/.exec(ua);
        if (!match || match.length != 3) {
            return;
        }

        this.name = match[1];
        this.version = match[2];
    },
};

var gAPI = {
    request: async function (aUrl, aHeaders = new Headers()) {
        let cacheKey = btoa(aUrl);
        let cacheETagKey = `${cacheKey}_ETag`;

        let data = localStorage.getItem(cacheKey);
        let etag = localStorage.getItem(cacheETagKey);
        if (data && etag) {
            data = JSON.parse(data);
            aHeaders.append("If-None-Match", etag);
        }
        aHeaders.append("User-Agent", `${APP_NAME}/${APP_VERSION}`);

        var isCached = false;
        await fetch(aUrl, {
            method: "GET",
            headers: aHeaders,
        }).then(async function (aResponse) {
            switch (aResponse.status) {
                case 304:
                    console.log(`Loading resource from cache: ${aUrl}`);
                    // Take response data from local storage
                    isCached = true;
                    break;
                case 200:
                    data = await aResponse.json();
                    console.log(`Saving resource to cache: ${aUrl}`);
                    localStorage.setItem(cacheKey, JSON.stringify(data));
                    localStorage.setItem(cacheETagKey, aResponse.headers.get("etag"));
                    break;
                default:
                    break;
            }
        }).catch(function (aException) {
            data = {
                message: aException.message
            };
        });

        return {
            json: data,
            isCached: isCached,
            cacheKey: cacheKey,
        };
    },

    requestFromGitHub: async function (aOptions, aEndpoint) {
        let url = `${URL_GITHUB_API}${aOptions.owner}/${aOptions.repo}/${aEndpoint}`;
        let headers = new Headers();

        System.import("./assets/config.js").then(() => {
            headers = new Headers({
                "Authorization": gat(),
            });
        });

        return this.request(url, headers);
    },

    getReleases: async function (aOptions) {
        let response = await this.requestFromGitHub(aOptions, "releases");
        if (!response.isCached && !response.json.message) {
            // Convert GitHub releases to custom releases format
            var releases = {
                totalDownloadCount: 0,
                stable: "",
                prerelease: "",
                data: {},
            };
            for (let ghRelease of response.json) {
                if (!releases.stable && !ghRelease.prerelease) {
                    releases.stable = ghRelease.tag_name;
                }
                if (!releases.prerelease && ghRelease.prerelease) {
                    releases.prerelease = ghRelease.tag_name;
                }
                var release = {
                    name: ghRelease.name || ghRelease.tag_name,
                    changelog: ghRelease.body,
                    prerelease: ghRelease.prerelease,
                    datePublished: ghRelease.published_at,
                    dateCreated: ghRelease.created_at,
                    zipballUrl: ghRelease.zipball_url,
                    tarballUrl: ghRelease.tarball_url,
                    xpi: {
                        url: "",
                        hash: "",
                        size: "",
                        downloadCount: "",
                    }
                };
                for (let asset of ghRelease.assets) {
                    if (asset.content_type != CONTENT_TYPE_XPI) {
                        continue;
                    }
                    release.xpi.url = asset.browser_download_url;
                    release.xpi.size = asset.size;
                    release.xpi.downloadCount = asset.download_count;
                    releases.totalDownloadCount += asset.download_count;
                    break;
                }
                releases.data[ghRelease.tag_name] = release;
            }
            // Replace cached JSON with converted releases copy
            localStorage.setItem(response.cacheKey, JSON.stringify(releases));
            return releases;
        }
        return response.json;
    },

    getRepositoryUrl: function (aOptions) {
        return `${URL_GITHUB}${aOptions.owner}/${aOptions.repo}`;
    },

    _metadata: null,
    getMetadata: async function () {
        if (this._metadata == null) {
            let response = await this.request(URL_CONTENT_METADATA);
            this._metadata = response.json;
        }
        return this._metadata;
    },

    _licenses: null,
    getLicenses: async function () {
        if (this._licenses == null) {
            let response = await this.request(URL_CONTENT_LICENSES);
            this._licenses = response.json;
        }
        return this._licenses;
    },

    getAddon: async function (aSlug) {
        let metadata = await this.getMetadata();
        var addon = metadata.addons.find(function (item) {
            return item.slug == aSlug;
        });
        return addon;
    },

    getAddonTypeFromId: async function (aTypeId) {
        let metadata = await this.getMetadata();
        let addonType = metadata.types.find(function (item) {
            return item.type == aTypeId;
        });
        return addonType;
    },

    getApplicationFromId: async function (aApplicationId) {
        let metadata = await this.getMetadata();
        if (aApplicationId > metadata.applications.length) {
            return null;
        }
        let application = metadata.applications[aApplicationId];
        return application;
    },

    getOwners: async function () {
        let metadata = await this.getMetadata();
        return metadata.owners;
    },

    getOwnerId: async function (aUsername) {
        let ownerData = await this.getOwners();
        var owner = ownerData.find(function (item) {
            return item.username == aUsername;
        });
        return ownerData.indexOf(owner);
    },
};

var gUtils = {
    formatDate: function (aDateString) {
        let date = new Date(aDateString);
        let dateOptions = { year: "numeric", month: "long", day: "numeric" };
        let formattedDate = date.toLocaleDateString(undefined, dateOptions);
        return formattedDate;
    },

    parseMarkdown: async function (aText) {
        let parsedValue = "";
        await System.import("./assets/libs/marked/marked.min.js")
            .then(function () {
                parsedValue = marked.parse(aText);
            });
        return parsedValue;
    },

    appendBadge: function (aTarget, aText, aClass = "") {
        let badgeElement = document.createElement("span");
        badgeElement.className = `badge ${aClass}`;
        badgeElement.innerText = aText;
        aTarget.appendChild(badgeElement);
        return badgeElement;
    },

    appendHtml: function (aTarget, aHtml, aClass = "") {
        let container = document.createElement("div");
        container.innerHTML = aHtml;
        container.className = aClass;
        aTarget.appendChild(container);
        return container;
    },

    appendInstallButton: function (aTarget, aAddon, aInstallData) {
        let button = document.createElement("a");
        let buttonIcon = document.createElement("div");
        button.append(buttonIcon);
        button.className = "button";
        button.href = "#";
        buttonIcon.className = "button-icon";

        if (gAppInfo.isGRE) {
            button.append("Install Now");
            button.addEventListener("click", async function (aEvent) {
                aEvent.preventDefault();
                var parameters = {};
                if (aInstallData) {
                    parameters[aAddon.name] = aInstallData
                } else {
                    button.classList.add("loading");
                    let releaseData = await gUtils.getReleaseData(aAddon);
                    let version = releaseData.stable || releaseData.prerelease;
                    // Return and mark button as disabled if there are
                    // no available releases
                    if (!version) {
                        button.classList.add("disabled");
                        button.classList.remove("loading");
                        button.innerText = "Unavailable";
                        return;
                    }
                    let release = releaseData.data[version];
                    parameters[aAddon.name] = {
                        URL: release.xpi.url,
                        IconURL: aAddon.iconUrl,
                        Hash: release.xpi.hash
                    };
                }
                try {
                    InstallTrigger.install(parameters);
                    button.classList.remove("loading");
                } catch (e) {
                    // Rethrow and expose the DOMError
                    console.error(e);
                }
            });
        } else {
            button.append("Download");
            if (aInstallData) {
                button.href = aInstallData.URL;
            } else {
                button.addEventListener("click", async function (aEvent) {
                    aEvent.preventDefault();
                    button.classList.add("loading");
                    let releaseData = await gUtils.getReleaseData(aAddon);
                    let version = releaseData.stable || releaseData.prerelease;
                    // Return and mark button as disabled if there are
                    // no available releases
                    if (!version) {
                        button.classList.add("disabled");
                        button.classList.remove("loading");
                        button.innerText = "Unavailable";
                        return;
                    }
                    let release = releaseData.data[version];
                    window.location.href = release.xpi.url;
                    button.classList.remove("loading");
                });
            }
            button.classList.add("download");
        }

        aTarget.append(button);
        return button;
    },

    createListItem: function () {
        let listItem = {
            parentElement: document.createElement("a"),
            body: document.createElement("div"),
            icon: document.createElement("img"),
            inner: document.createElement("div"),
            title: document.createElement("div"),
            desc: document.createElement("div"),
        };

        listItem.parentElement.className = "list-item";
        listItem.body.className = "list-item-body";
        listItem.icon.className = "list-item-icon";
        listItem.title.className = "list-item-title";
        listItem.desc.className = "list-item-desc";

        listItem.parentElement.append(listItem.body);
        listItem.body.append(listItem.icon);
        listItem.body.append(listItem.inner);
        listItem.inner.append(listItem.title);
        listItem.inner.append(listItem.desc);

        return listItem;
    },

    createList: function (aAddons, aDefaultIcon, aPage) {
        let list = document.createElement("div");
        list.className = "list";

        var i = 0;
        var length = aAddons.length;
        if (aPage) {
            i = (aPage - 1) * LIST_MAX_ITEMS;
            length = aPage * LIST_MAX_ITEMS;
            if (length > aAddons.length) {
                length = aAddons.length;
            }
            if (i >= length) {
                list.append("No results found.");
                return list;
            }
        }

        for (; i < length; i++) {
            let addon = aAddons[i];
            let listItem = gUtils.createListItem();

            // Icon
            if (addon.iconUrl) {
                listItem.icon.src = addon.iconUrl;
            } else {
                listItem.icon.src = aDefaultIcon;
            }
            listItem.icon.alt = `${addon.name} Icon`;

            // Title and description
            listItem.title.innerText = addon.name;
            if (addon.description) {
                listItem.desc.innerText = addon.description;
            }

            // Download button
            if (addon.xpi) {
                gUtils.appendInstallButton(
                    listItem.parentElement,
                    addon,
                    {
                        URL: addon.xpi.url,
                        IconURL: addon.iconUrl,
                        Hash: addon.xpi.hash
                    }
                );
            }

            if (addon.externalUrl) {
                listItem.parentElement.href = addon.externalUrl;
                listItem.parentElement.target = "_blank";
                gUtils.appendBadge(listItem.title, "External");
            }

            if (addon.ghInfo || addon.releasesUrl) {
                listItem.parentElement.href = `${URL_APP_BASE}get?addon=${addon.slug}`;
                gUtils.appendInstallButton(
                    listItem.parentElement,
                    addon,
                    null
                );
            }

            // Append list item to extensions list
            list.appendChild(listItem.parentElement);
        }

        return list;
    },

    createPaginationLink: function (aUrlParameters, aPageCount, aCurrentPage, aTargetPage, aLabel) {
        let link = document.createElement("a");
        link.className = "pagination-link";
        link.innerText = aLabel || aTargetPage;
        if (aTargetPage == aCurrentPage) {
            link.classList.add("active");
        }
        if (aTargetPage < 1 || aTargetPage > aPageCount || aTargetPage == aCurrentPage) {
            link.classList.add("disabled");
        } else {
            aUrlParameters.set("page", aTargetPage);
            link.href = "?" + aUrlParameters.toString();
        }
        return link;
    },

    createPagination: function (aPageCount, aCurrentPage) {
        var pagination = document.createElement("div");
        pagination.className = "pagination";

        if (aCurrentPage > aPageCount) {
            return pagination;
        }

        let startIndex = Math.max(1, aCurrentPage - 2);
        let lastIndex = Math.min(startIndex + 5, aPageCount + 1);
        startIndex = Math.max(1, startIndex - (5 - (lastIndex - startIndex)));

        let linkWrapper = document.createElement("div");
        linkWrapper.className = "pagination-link-wrapper";
        pagination.append(linkWrapper);

        var urlParameters = new URLSearchParams(window.location.search);
        let prevLink = gUtils.createPaginationLink(urlParameters, aPageCount, aCurrentPage, aCurrentPage - 1, "Previous");
        let nextLink = gUtils.createPaginationLink(urlParameters, aPageCount, aCurrentPage, aCurrentPage + 1, "Next");

        linkWrapper.append(prevLink);
        for (let i = startIndex; i < lastIndex; i++) {
            let link = gUtils.createPaginationLink(urlParameters, aPageCount, aCurrentPage, i);
            linkWrapper.append(link);
        }
        linkWrapper.append(nextLink);

        let pageNumber = document.createElement("div");
        pageNumber.className = "pagination-page-number";
        pageNumber.innerText = `Page ${aCurrentPage} of ${aPageCount}`;
        pagination.append(pageNumber);

        return pagination;
    },

    createIsland: function (aTitle) {
        let island = document.createElement("div");
        island.className = "island";

        if (aTitle) {
            let title = document.createElement("h3");
            title.innerText = aTitle;
            island.appendChild(title);
        }

        return island;
    },

    appendLink: function (aTarget, aText, aUrl, aExternal) {
        let link = document.createElement("a");
        link.innerText = aText;
        link.href = aUrl;
        if (aExternal) {
            link.target = "_blank";
        }
        link.style.display = "block";
        aTarget.appendChild(link);
        return link;
    },

    createAddonColumn: function (aSecondary) {
        var column = {};

        let container = document.createElement("div");
        container.className = "col";
        column.container = container;

        let content = document.createElement("div");
        content.className = "col-inner";
        column.content = content;
        container.appendChild(content);

        if (aSecondary) {
            container.classList.add("col-secondary");
            return column;
        } else {
            container.classList.add("col-primary");
        }

        let addonWrapper = document.createElement("div");
        addonWrapper.id = "addon";
        addonWrapper.className = "island";
        column.addon = addonWrapper;
        content.appendChild(addonWrapper);

        let icon = document.createElement("img");
        icon.id = "addon-icon";
        icon.width = 64;
        icon.height = 64;
        column.addonIcon = icon;
        addonWrapper.appendChild(icon);

        let detailWrapper = document.createElement("div");
        detailWrapper.id = "addon-detail";
        column.addonDetail = detailWrapper;
        addonWrapper.appendChild(detailWrapper);

        let summary = document.createElement("div");
        summary.id = "addon-summary";
        detailWrapper.appendChild(summary);
        column.addonSummary = summary;

        let install = document.createElement("div");
        install.id = "addon-install";
        detailWrapper.appendChild(install);
        column.addonInstall = install;

        return column;
    },

    appendLinkGroup(aTarget, aLinks, aClassName) {
        let container = document.createElement("div");
        container.className = aClassName;
        let lastIndex = aLinks.length - 1;
        for (let i = 0; i < aLinks.length; i++) {
            let link = aLinks[i];
            let anchor = document.createElement("a");
            anchor.innerText = link.label;
            anchor.href = link.url;
            container.appendChild(anchor);
            if (i < lastIndex) {
                let separator = document.createElement("span");
                separator.innerText = " | ";
                container.appendChild(separator);
            }
        }
        aTarget.appendChild(container);
    },

    createOwners: async function (aOwnerIds, aLink) {
        let ownerData = await gAPI.getOwners();
        if (!aOwnerIds) {
            return "{unknown owner}";
        }

        var ownersList = "";
        let lastIndex = aOwnerIds.length - 1;
        for (let i = 0; i < aOwnerIds.length; i++) {
            let ownerId = aOwnerIds[i];
            let currOwner = ownerData[ownerId];
            if (aLink) {
                ownersList += `<a href="${URL_APP_BASE}?user=${currOwner.username}">`;
            }
            ownersList += currOwner.displayName;
            if (aLink) {
                ownersList += "</a>";
            }
            if (i < lastIndex) {
                ownersList += ", ";
            }
        }

        return ownersList;
    },

    clearStorage: function () {
        console.log(`Clearing local storage`);
        localStorage.clear();
        localStorage.setItem("version", APP_VERSION);
    },

    migrate: function () {
        let version = localStorage.getItem("version");
        if (version && version == APP_VERSION) {
            return;
        }
        gUtils.clearStorage();
    },
    
    getReleaseData: async function (aAddon) {
        var releaseData = null;

        if (aAddon.ghInfo) {
            releaseData = await gAPI.getReleases(aAddon.ghInfo);
        }

        if (aAddon.releasesUrl) {
            var releasesUrl = aAddon.releasesUrl;
            if (releasesUrl == "static") {
                releasesUrl = `${URL_CONTENT_RELEASES}/${aAddon.slug}.json`;
            }
            var response = await gAPI.request(releasesUrl);
            var responseData = response.json;
            // Take compatibility information from static release data
            // if there is information from the GitHub API
            if (releaseData) {
                releaseData.compatibility = responseData.data;
            } else {
                releaseData = responseData;
            }
        }

        return releaseData;
    },
};

var gThemes = {
    get styleSheetSets() {
        if (gAppInfo.isGRE && document.styleSheetSets) {
            return document.styleSheetSets;
        }

        let styleSheetSets = [];
        let links = document.getElementsByTagName("link");
        for (let i = 0; i < links.length; i++) {
            let currentLink = links[i];
            if (!currentLink.rel.includes("stylesheet") ||
                currentLink.title == "") {
                continue;
            }
            if (currentLink.title) {
                styleSheetSets.push(currentLink.title);
            }
        }
        return styleSheetSets;
    },
    
    set selectedStyleSheetSet(aTitle) {
        if (gAppInfo.isGRE && document.selectedStyleSheetSet) {
            document.selectedStyleSheetSet = aTitle;
            return;
        }

        let links = document.getElementsByTagName("link");
        for (let i = 0; i < links.length; i++) {
            let currentLink = links[i];
            if (!currentLink.rel.includes("stylesheet") ||
                !currentLink.title) {
                continue;
            }
            currentLink.disabled = true;
            if (currentLink.title == aTitle) {
                currentLink.disabled = false;
            }
        }
    },
    
    init: function () {
        if (gThemes.styleSheetSets.length == 0) {
            return;
        }

        let preferredTheme = localStorage.getItem("theme");
        if (preferredTheme) {
            gThemes.selectedStyleSheetSet = preferredTheme;
        }

        let themeSelector = document.createElement("div"); 
        themeSelector.innerText = "Theme: ";

        let lastIndex = gThemes.styleSheetSets.length - 1;
        for (let i = 0; i < gThemes.styleSheetSets.length; i++) {
            let themeName = gThemes.styleSheetSets[i];
            let themeLink = document.createElement("a");
            themeLink.href = "#";
            themeLink.innerText = themeName;
            themeLink.addEventListener("click", function (aEvent) {
                aEvent.preventDefault();
                gThemes.selectedStyleSheetSet = themeName;
                localStorage.setItem("theme", themeName);
            });
            themeSelector.append(themeLink);
            if (i < lastIndex) {
                themeSelector.append(" | ");
            }
        }
        gSections.primary.footer.append(themeSelector);
    },
};

var gSections = {
    add: function (aName, aFixed) {
        var section = {};

        // Section element
        let container = document.createElement("section");
        if (aFixed) {
            container.className = "fixed";
        }
        container.id = `section-${aName}`;
        section.container = container;
        document.body.appendChild(container);

        // Content layout
        let content = document.createElement("div");
        content.className = "content-layout box";
        section.content = content;
        container.appendChild(content);

        return section;
    },

    _createInnerBox: function (aName, aTagName) {
        let tagName = aTagName ? aTagName : "div";
        let innerBox = document.createElement(tagName);
        innerBox.className = "box-inner";
        innerBox.id = `page-${aName}`;
        return innerBox;
    },

    init: function () {
        /* ::: Loader :::*/
        var section = gSections.add("loader", true);
        gSections.loader = section;

        // Throbber
        let throbber = document.createElement("div");
        throbber.className = "throbber";
        section.content.appendChild(throbber);

        /* ::: Primary :::*/
        var section = gSections.add("primary");
        gSections.primary = section;

        // Header
        let header = document.createElement("header");
        header.id = "page-header";
        section.header = header;

        let headerInner = document.createElement("div");
        headerInner.id = "page-header-inner";
        section.headerInner = headerInner;
        header.appendChild(headerInner);

        let headerLogo = document.createElement("div");
        headerLogo.id = "page-header-logo";
        headerInner.appendChild(headerLogo);

        // Navigation
        let navList = document.createElement("ul");
        for (let nav of APP_NAV) {
            let navItem = document.createElement("li");
            let navLink = document.createElement("a");
            navLink.id = `menu-${nav.id}`;
            navLink.href = nav.url;
            navLink.innerText = nav.label;
            navItem.appendChild(navLink);
            navList.appendChild(navItem);
        }
        section.navList = navList;

        let navContainer = document.createElement("nav");
        navContainer.id = "page-nav";
        navContainer.appendChild(navList);
        header.appendChild(navContainer);

        // Main
        let main = gSections._createInnerBox("main", "main");
        section.main = main;

        // Footer
        let footer = document.createElement("footer");
        footer.innerText = `This site is powered by ${APP_NAME} ${APP_VERSION}.`;
        section.footer = footer;

        section.content.appendChild(header);
        section.content.appendChild(main);
        section.content.appendChild(footer);
    },

    setActiveNav: function (aId) {
        let navLink = document.getElementById(`menu-${aId}`);
        if (navLink) {
            navLink.classList.add("active");
        }
    },
};

var gSite = {
    set title(aTitle) {
        document.title = `${aTitle} - Add-ons - ${APP_NAME}`;
    },

    buildCategoryPage: async function (aTypeSlug, aOwner, aTerms, aPage) {
        let metadata = await gAPI.getMetadata();

        var types = metadata.types;
        for (let i = 0; i < types.length; i++) {
            var listBox = document.createElement("div");
            listBox.className = "list-wrapper";

            let addonType = types[i];
            let title = "";
            if (aTypeSlug) {
                if (addonType.slug != aTypeSlug) {
                    continue;
                }
                title = addonType.name;
            } else {
                title = "All";
            }
            gSite.title = title;

            let listTitle = document.createElement("h1");
            listTitle.innerText = addonType.name;
            listTitle.id = addonType.slug;

            let listDescription = document.createElement("p");
            listDescription.innerText = addonType.description;

            var ownerId;
            if (aOwner) {
                ownerId = await gAPI.getOwnerId(aOwner);
            }

            if (aTerms) {
                aTerms = aTerms.trim().toLowerCase();
            }

            let addons = metadata.addons.filter(function (item) {
                let matchType = item.type == addonType.type;
                let matchOwner = true;
                if (aOwner && item.owners) {
                    matchOwner = item.owners.includes(ownerId);
                }
                let matchTerms = true;
                if (aTerms) {
                    matchTerms = item.name.toLowerCase().includes(aTerms) ||
                                 item.description && item.description.includes(aTerms);
                }

                return matchType && matchOwner && matchTerms;
            }).sort(function (a, b) {
                return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
            });
            if (addons.length == 0) {
                continue;
            }

            let list = gUtils.createList(addons, addonType.defaultIcon, aPage);

            listBox.append(listTitle);
            if (!aOwner && !aTerms) {
                listBox.append(listDescription);
            }
            listBox.append(list);
            if (aPage) {
                let pageCount = Math.ceil(addons.length / LIST_MAX_ITEMS);
                listBox.append(gUtils.createPagination(pageCount, aPage));
            }

            gSections.primary.main.appendChild(listBox);
        }

        if (aTypeSlug) {
            gSections.setActiveNav(aTypeSlug);
        } else {
            gSections.setActiveNav("all");
        }
    },

    buildAddonPage: async function (aAddonSlug, aVersionHistory) {
        var addon = await gAPI.getAddon(aAddonSlug);
        if (!addon) {
            gSections.primary.main.innerText = "Invalid add-on.";
            gSite.doneLoading();
            return;
        }

        var addonType = await gAPI.getAddonTypeFromId(addon.type);
        gSections.setActiveNav(addonType.slug);

        gSections.primary.main.classList.add("two-col");
        var colPrimary = gUtils.createAddonColumn();
        var colSecondary = gUtils.createAddonColumn(true);

        gSections.primary.main.appendChild(colPrimary.container);
        gSections.primary.main.appendChild(colSecondary.container);

        var ilLicense = gUtils.createIsland("License");
        var ilResources = gUtils.createIsland("Resources");

        colPrimary.addonIcon.src = addonType.defaultIcon;
        if (addon.iconUrl) {
            colPrimary.addonIcon.src = addon.iconUrl;
        }

        // Identify add-on license
        var licenseText = "";
        var licenseUrl = `${URL_APP_BASE}license?addon=${addon.slug}`;
        if (addon.license) {
            let licenses = await gAPI.getLicenses();
            licenseText = licenses.names[addon.license];
        } else {
            let ownersList = await gUtils.createOwners(addon.owners);
            licenseText = `© ${new Date().getFullYear()} ${ownersList}`;
        }
        gUtils.appendLink(ilLicense, licenseText, licenseUrl, true);

        // Add-on releases data
        var releaseData = await gUtils.getReleaseData(addon);
        if (releaseData == null) {
            gSections.primary.main.innerText = "Release data missing.";
            gSite.doneLoading();
            return;
        }

        // Show message thrown by API and return early
        if (releaseData.message) {
            gSections.primary.main.innerText = releaseData.message;
            gSite.doneLoading();
            return;
        }

        if (aVersionHistory) {
            let releaseDataEntries = Object.entries(releaseData.data);
            gSite.title = `${addon.name} - Versions`;
            gUtils.appendLink(ilResources, "Add-on Details", `${URL_APP_BASE}get?addon=${addon.slug}`, false);

            gUtils.appendHtml(colPrimary.addonSummary, `${addon.name} Versions`, "h1");
            gUtils.appendHtml(colPrimary.addonSummary, `${releaseDataEntries.length} releases`);

            let releaseList = document.createElement("div");
            colPrimary.content.appendChild(releaseList);

            for (let [version, release] of releaseDataEntries) {
                let listItem = gUtils.createListItem();
                listItem.icon.remove();
                listItem.title.innerText = release.name;
                if (release.prerelease) {
                    gUtils.appendBadge(listItem.title, "Pre-release", "prerelease");
                }
                if (release.datePublished) {
                    let dateString = gUtils.formatDate(release.datePublished);
                    gUtils.appendHtml(listItem.desc, `Released: ${dateString}`);
                }
                if (release.xpi.size) {
                    gUtils.appendHtml(listItem.desc, `Size: ${Math.round(release.xpi.size / 1024)} KB`);
                }
                if (release.xpiDownloadCount) {
                    gUtils.appendHtml(listItem.desc, `Downloads: ${release.xpiDownloadCount}`);
                }
                let releaseCompatibility = release.applications ||
                    (releaseData.compatibility &&
                     releaseData.compatibility[version].applications);
                if (releaseCompatibility) {
                    gUtils.appendHtml(listItem.desc, "Works with:");
                    for (let j = 0; j < releaseCompatibility.length; j++) {
                        let compatInfo = releaseCompatibility[j];
                        let appInfo = await gAPI.getApplicationFromId(compatInfo.id);
                        gUtils.appendHtml(listItem.desc, `${appInfo.displayName} ${compatInfo.minVersion} to ${compatInfo.maxVersion}`);
                    }
                }
                if (release.changelog) {
                    gUtils.appendHtml(listItem.desc, await gUtils.parseMarkdown(release.changelog));
                }

                let artifactLinks = [];
                if (release.xpi.url) {
                    gUtils.appendInstallButton(
                        listItem.parentElement,
                        addon,
                        {
                            URL: release.xpi.url,
                            IconURL: addon.iconUrl,
                            Hash: release.xpi.hash
                        }
                    );
                    artifactLinks.push({
                        label: "Download XPI",
                        url: release.xpi.url
                    });
                }
                if (release.tarballUrl) {
                    artifactLinks.push({
                        label: "Download tarball",
                        url: release.tarballUrl
                    });
                }
                if (release.zipballUrl) {
                    artifactLinks.push({
                        label: "Download zipball",
                        url: release.zipballUrl
                    });
                }
                gUtils.appendLinkGroup(listItem.desc, artifactLinks, "addon-artifacts");
                releaseList.appendChild(listItem.parentElement);
            }
        } else {
            gSite.title = addon.name;
            gUtils.appendLink(ilResources, "Version History", `${URL_APP_BASE}versions?addon=${addon.slug}`, false);

            let version = releaseData.stable || releaseData.prerelease;
            let release = releaseData.data[version];

            let ownersList = await gUtils.createOwners(addon.owners, true);
            gUtils.appendHtml(colPrimary.addonSummary, addon.name, "h1");
            gUtils.appendHtml(colPrimary.addonSummary, `By ${ownersList}`);
            if (addon.description) {
                gUtils.appendHtml(colPrimary.addonSummary, addon.description);
            }

            if (release) {
                if (release.name) {
                    var ilVersion = gUtils.createIsland("Version");
                    colSecondary.content.appendChild(ilVersion);
                    gUtils.appendHtml(ilVersion, release.name);
                }
                if (release.datePublished) {
                    var ilLastUpdated = gUtils.createIsland("Last Updated");
                    colSecondary.content.appendChild(ilLastUpdated);
                    let releaseDate = gUtils.formatDate(release.datePublished);
                    gUtils.appendHtml(ilLastUpdated, releaseDate);
                }
                if (release.xpi.size) {
                    var ilSize = gUtils.createIsland("Size");
                    colSecondary.content.appendChild(ilSize);
                    gUtils.appendHtml(ilSize, `${Math.round(release.xpi.size / 1024)} KB`);
                }
                if (releaseData.totalDownloadCount) {
                    var ilDownloads = gUtils.createIsland("Total Downloads");
                    colSecondary.content.appendChild(ilDownloads);
                    gUtils.appendHtml(ilDownloads, releaseData.totalDownloadCount);
                }
                let releaseCompatibility = release.applications ||
                    (releaseData.compatibility &&
                     releaseData.compatibility[version].applications);
                if (releaseCompatibility) {
                    var ilCompatibility = gUtils.createIsland("Compatibility");
                    colPrimary.content.appendChild(ilCompatibility);
                    for (let j = 0; j < releaseCompatibility.length; j++) {
                        let compatInfo = releaseCompatibility[j];
                        let appInfo = await gAPI.getApplicationFromId(compatInfo.id);
                        gUtils.appendHtml(ilCompatibility, `${appInfo.displayName} ${compatInfo.minVersion} to ${compatInfo.maxVersion}`);
                    }
                }
                if (release.changelog) {
                    var ilChangelog = gUtils.createIsland("Release Notes");
                    gUtils.appendHtml(ilChangelog, await gUtils.parseMarkdown(release.changelog));
                    colPrimary.content.appendChild(ilChangelog);
                }
                if (release.xpi.url) {
                    gUtils.appendInstallButton(
                        colPrimary.addonInstall,
                        addon,
                        {
                            URL: release.xpi.url,
                            IconURL: addon.iconUrl,
                            Hash: release.xpi.hash
                        }
                    );
                }
            } else {
                var ilMessage = gUtils.createIsland("Message");
                gUtils.appendHtml(ilMessage, "This add-on has no releases.");
                colPrimary.content.appendChild(ilMessage);
            }
        }

        if (addon.supportEmail) {
            gUtils.appendLink(ilResources, "Support E-mail", addon.supportEmail, true);
        }
        if (addon.supportUrl) {
            gUtils.appendLink(ilResources, "Support Site", addon.supportUrl, true);
        }
        if (addon.repositoryUrl) {
            gUtils.appendLink(ilResources, "Source Repository", addon.repositoryUrl, true);
        } else if (addon.ghInfo) {
            gUtils.appendLink(ilResources, "Source Repository", gAPI.getRepositoryUrl(addon.ghInfo), true);
        }
        if (addon.mirrors) {
            for (let i = 0; i < addon.mirrors.length; i++) {
                var mirrorSite = addon.mirrors[i];
                var mirrorUrl = "";
                var mirrorName = "Mirror: "
                switch (mirrorSite) {
                    case "phoebus_pm":
                        mirrorName += "Pale Moon Add-ons Site";
                        mirrorUrl = MIRROR_PHOEBUS_PM + addon.slug;
                        break;
                    case "phoebus_bk":
                        mirrorName += "Basilisk Add-ons Site";
                        mirrorUrl = MIRROR_PHOEBUS_BK + addon.slug;
                        break;
                    case "phoebus_in":
                        mirrorName += "Interlink Add-ons Site";
                        mirrorUrl = MIRROR_PHOEBUS_IN + addon.slug;
                        break;
                    case "phoebus_es":
                        mirrorName += "Epyrus Add-ons Site";
                        mirrorUrl = MIRROR_PHOEBUS_ES + addon.slug;
                        break;
                    case "amo":
                        mirrorName += "Mozilla Add-ons Site";
                        mirrorUrl = MIRROR_AMO + addon.slug;
                        break;
                }
                gUtils.appendLink(ilResources, mirrorName, mirrorUrl, true);
            }
        }

        colSecondary.content.appendChild(ilLicense);
        colSecondary.content.appendChild(ilResources);
    },

    buildLicensePage: async function (aAddonSlug) {
        var addon = await gAPI.getAddon(aAddonSlug);
        if (!addon) {
            gSections.primary.main.innerText = "Invalid add-on.";
            gSite.doneLoading();
            return;
        }

        var addonType = await gAPI.getAddonTypeFromId(addon.type);
        gSections.setActiveNav(addonType.slug);

        gSite.title = `${addon.name} - License`;

        if (addon.license && addon.license != "PD") {
            gSections.primary.main.innerText = "Redirecting to license page...";
            let licenseUrl;
            if (addon.license == "custom" && addon.licenseUrl) {
                licenseUrl = addon.licenseUrl;
            } else {
                licenseUrl = `${URL_LICENSE}${addon.license}`;
            }
            window.location.href = licenseUrl;
            return;
        }

        var colPrimary = gUtils.createAddonColumn();
        gSections.primary.main.appendChild(colPrimary.container);
        gSections.primary.main.classList.add("two-col");

        // License data
        var licenses = await gAPI.getLicenses();
        // Show message thrown by API and return early
        if (licenses.message) {
            gSections.primary.main.innerText = licenses.message;
            gSite.doneLoading();
            return;
        }

        colPrimary.addonIcon.src = addonType.defaultIcon;
        if (addon.iconUrl) {
            colPrimary.addonIcon.src = addon.iconUrl;
        }

        gUtils.appendHtml(colPrimary.addonSummary, addon.name, "h1");
        var ownersList = await gUtils.createOwners(addon.owners, true);
        gUtils.appendHtml(colPrimary.addonSummary, `By ${ownersList}`);

        var ilLicense = gUtils.createIsland("License");
        var licenseText = "";
        if (addon.license == "PD") {
            licenseText = licenses.licenseText["publicDomain"];
        } else {
            licenseText = licenses.licenseText["copyrighted"];
        }
        gUtils.appendHtml(ilLicense, licenseText);
        colPrimary.content.appendChild(ilLicense);
    },

    onLoad: async function () {
        gAppInfo.identify();
        gUtils.migrate();
        gSections.init();
        gThemes.init();

        var urlParameters = new URLSearchParams(window.location.search);
        if (urlParameters.has("reset")) {
            gUtils.clearStorage();
        }
        var addonSlug = urlParameters.get("addon");

        switch (pageInfo.id) {
            // Category/User/Search
            case 0:
                var category = urlParameters.get("category");
                var user = urlParameters.get("user");
                var searchTerms = urlParameters.get("q");
                var page = parseInt(urlParameters.get("page"));
                // Ignore page parameter if showing all add-ons
                if (!category && page) {
                    page = null;
                }
                await gSite.buildCategoryPage(category, user, searchTerms, page);
                break;
            // Add-on
            case 1:
                if (!addonSlug) {
                    gSections.primary.main.innerText = "Missing add-on parameter.";
                    gSite.doneLoading();
                    return;
                }
                await gSite.buildAddonPage(addonSlug, pageInfo.versionHistory);
                break;
            case 2:
                if (!addonSlug) {
                    gSections.primary.main.innerText = "Missing add-on parameter.";
                    gSite.doneLoading();
                    return;
                }
                await gSite.buildLicensePage(addonSlug);
                break;
        }

        gSite.doneLoading();
    },

    doneLoading: function () {
        document.body.dataset.loaded = true;
        // Handle the fragment identifier, necessary if the anchor
        // is dynamically generated
        let fragmentId = window.location.hash.substr(1);
        if (fragmentId) {
            let targetElement = document.getElementById(fragmentId);
            if (targetElement) {
                targetElement.scrollIntoView(true);
            }
        }
    },
};

window.addEventListener("DOMContentLoaded", gSite.onLoad);
