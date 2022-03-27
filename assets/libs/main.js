const APP_NAME = "Fresco";
const APP_VERSION = "0.0.1a2";
const APP_NAV = [
    {
        id: "all",
        label: "All",
        url: "/addons"
    },
    {
        id: "extensions",
        label: "Extensions",
        url: "/addons/?category=extensions&page=1"
    },
    {
        id: "themes",
        label: "Themes",
        url: "/addons/?category=themes&page=1"
    },
    {
        id: "dictionaries",
        label: "Dictionaries",
        url: "/addons/?category=dictionaries&page=1"
    },
    {
        id: "language-packs",
        label: "Language Packs",
        url: "/addons/?category=language-packs&page=1"
    }
];

const JSON_METADATA = "assets/metadata.json";
const JSON_LICENSES = "assets/licenses.json";
const CONTENT_TYPE_XPI = "application/x-xpinstall";

const URL_GITHUB_API = "https://api.github.com/repos";
const URL_GITHUB = "https://github.com";
const URL_LICENSE = "https://opensource.org/licenses";

const MIRROR_PHOEBUS_PM = "https://addons.palemoon.org/addon/";
const MIRROR_PHOEBUS_BK = "https://addons.basilisk-browser.org/addon/";
const MIRROR_PHOEBUS_IN = "https://interlink-addons.binaryoutcast.com/addon/";
const MIRROR_AMO = "https://addons.mozilla.org/en-US/firefox/addon/";

const LIST_MAX_ITEMS = 25;

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
        let url = `${URL_GITHUB_API}/${aOptions.owner}/${aOptions.repo}/${aEndpoint}`;
        let headers = new Headers();

        System.import("./assets/libs/config.js").then(() => {
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
                experimental: "",
                data: {},
            };
            for (let ghRelease of response.json) {
                if (!releases.stable && !ghRelease.prerelease) {
                    releases.stable = ghRelease.tag_name;
                }
                if (!releases.experimental && ghRelease.prerelease) {
                    releases.experimental = ghRelease.tag_name;
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
                    },
                    author: {
                        slug: "",
                        name: ghRelease.author.login,
                        avatarUrl: ghRelease.author.avatar_url,
                    },
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
        return `${URL_GITHUB}/${aOptions.owner}/${aOptions.repo}`;
    },

    _metadata: null,
    getMetadata: async function () {
        if (this._metadata == null) {
            let response = await this.request(JSON_METADATA);
            this._metadata = response.json;
        }
        return this._metadata;
    },

    _licenses: null,
    getLicenses: async function () {
        if (this._licenses == null) {
            let response = await this.request(JSON_LICENSES);
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

var gAppInfo = {
    identify: function () {
        var ua = navigator.userAgent;
        this.isGRE = /Goanna/.test(ua) && InstallTrigger;

        var match = /(PaleMoon|Basilisk|Interlink|Borealis)\/([^\s]*).*$/.exec(ua);
        if (!match || match.length != 3) {
            return;
        }

        this.name = match[1];
        this.version = match[2];
    },
};

var gSite = {
    _updateTitle: function (aTitle) {
        document.title = `${aTitle} - Add-ons - ${APP_NAME}`;
    },
    
    _formatDate: function (aDateString) {
        let date = new Date(aDateString);
        let dateOptions = { year: "numeric", month: "long", day: "numeric" };
        let formattedDate = date.toLocaleDateString(undefined, dateOptions);
        return formattedDate;
    },

    _parseMarkdown: async function (aText) {
        let parsedValue = "";
        await System.import("./assets/libs/marked/marked.min.js")
            .then(function () {
                parsedValue = marked.parse(aText);
            });
        return parsedValue;
    },

    _appendBadge: function (aTarget, aText, aClass = "") {
        let badgeElement = document.createElement("span");
        badgeElement.className = `badge ${aClass}`;
        badgeElement.innerText = aText;
        aTarget.appendChild(badgeElement);
        return badgeElement;
    },

    _appendHtml: function (aTarget, aHtml, aClass = "") {
        let container = document.createElement("div");
        container.innerHTML = aHtml;
        container.className = aClass;
        aTarget.appendChild(container);
        return container;
    },

    _appendInstallButton: function (aTarget, aAddonName, aInstallData) {
        let button = document.createElement("a");
        let buttonIcon = document.createElement("div");
        button.append(buttonIcon);
        button.className = "button";
        buttonIcon.className = "button-icon";

        if (gAppInfo.isGRE) {
            button.append("Install Now");
            button.href = "#";
            button.addEventListener("click", function (aEvent) {
                aEvent.preventDefault();
                var parameters = {
                    [aAddonName]: aInstallData
                };
                try {
                    InstallTrigger.install(parameters);
                } catch (e) {
                    // Rethrow and expose the DOMError
                    console.error(e);
                }
            });
        } else {
            button.append("Download");
            button.href = aInstallData.URL;
            button.classList.add("download");
        }

        aTarget.append(button);
        return button;
    },

    _createListItem: function () {
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

    _createList: function (aAddons, aDefaultIcon, aPage) {
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
            let listItem = gSite._createListItem();

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
                gSite._appendInstallButton(
                    listItem.parentElement,
                    addon.name,
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
                gSite._appendBadge(listItem.title, "External");
            }

            if (addon.ghInfo || addon.releasesUrl) {
                listItem.parentElement.href = `/addons/get?addon=${addon.slug}`;
            }

            // Append list item to extensions list
            list.appendChild(listItem.parentElement);
        }
        
        return list;
    },

    _createInnerBox: function (aName, aTagName) {
        let tagName = aTagName ? aTagName : "div";
        let innerBox = document.createElement(tagName);
        innerBox.className = "box-inner";
        innerBox.id = `page-${aName}`;
        return innerBox;
    },

    _addSection: function (aName, aFixed) {
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

    _addLoaderSection: function () {
        var section = gSite._addSection("loader", true);
        gSite.loader = section;

        // Throbber
        let throbber = document.createElement("img");
        throbber.src = "assets/images/throbber.gif";
        throbber.width = 32;
        throbber.height = 32;

        let throbberBox = gSite._createInnerBox("loader");
        throbberBox.appendChild(throbber);
        section.content.appendChild(throbberBox);
    },

    _addPrimarySection: function () {
        var section = gSite._addSection("primary");
        gSite.primary = section;

        // Header
        let header = document.createElement("header");
        header.id = "page-header";
        section.header = header;

        let headerInner = document.createElement("div");
        headerInner.id = "page-header-inner";
        section.headerInner = headerInner;
        header.appendChild(headerInner);

        let headerLogo = document.createElement("img");
        headerLogo.id = "page-header-logo";
        headerLogo.src = "assets/images/header_logo.svg";
        section.headerLogo = headerLogo;
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
        let main = gSite._createInnerBox("main", "main");
        section.main = main;

        // Footer
        let footer = document.createElement("footer");
        footer.innerText = `This site is powered by ${APP_NAME} ${APP_VERSION}.`;
        section.footer = footer;

        section.content.appendChild(header);
        section.content.appendChild(main);
        section.content.appendChild(footer);
    },

    _setActiveNav: function (aId) {
        let navLink = document.getElementById(`menu-${aId}`);
        if (navLink) {
            navLink.classList.add("active");
        }
    },

    _createPaginationLink: function (aUrlParameters, aPageCount, aCurrentPage, aTargetPage, aLabel) {
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

    _createPagination: function (aPageCount, aCurrentPage) {
        var pagination = document.createElement("div");
        pagination.className = "pagination";
        
        if (aCurrentPage > aPageCount) {
            return pagination;
        }

        let startIndex = Math.max(1, aCurrentPage - 2);
        let lastIndex = Math.min(startIndex + 5, aPageCount + 1);
        startIndex = Math.max(1, startIndex - (5 - (lastIndex - startIndex)));
        console.log(startIndex, lastIndex);

        let linkWrapper = document.createElement("div");
        linkWrapper.className = "pagination-link-wrapper";
        pagination.append(linkWrapper);

        var urlParameters = new URLSearchParams(window.location.search);
        let prevLink = gSite._createPaginationLink(urlParameters, aPageCount, aCurrentPage, aCurrentPage - 1, "Previous");
        let nextLink = gSite._createPaginationLink(urlParameters, aPageCount, aCurrentPage, aCurrentPage + 1, "Next");

        linkWrapper.append(prevLink);
        for (let i = startIndex; i < lastIndex; i++) {
            let link = gSite._createPaginationLink(urlParameters, aPageCount, aCurrentPage, i);
            linkWrapper.append(link);
        }
        linkWrapper.append(nextLink);

        let pageNumber = document.createElement("div");
        pageNumber.className = "pagination-page-number";
        pageNumber.innerText = `Page ${aCurrentPage} of ${aPageCount}`;
        pagination.append(pageNumber);
        
        return pagination;
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
            gSite._updateTitle(title);

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

            let list = gSite._createList(addons, addonType.defaultIcon, aPage);

            listBox.append(listTitle);
            if (!aOwner && !aTerms) {
                listBox.append(listDescription);
            }
            listBox.append(list);
            if (aPage) {
                let pageCount = Math.ceil(addons.length / LIST_MAX_ITEMS);
                listBox.append(gSite._createPagination(pageCount, aPage));
            }

            gSite.primary.main.appendChild(listBox);
        }

        if (aTypeSlug) {
            gSite._setActiveNav(aTypeSlug);
        } else {
            gSite._setActiveNav("all");
        }
    },

    _createIsland: function (aTitle) {
        let island = document.createElement("div");
        island.className = "island";

        if (aTitle) {
            let title = document.createElement("h3");
            title.innerText = aTitle;
            island.appendChild(title);
        }

        return island;
    },

    _appendLink: function (aTarget, aText, aUrl, aExternal) {
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

    _createAddonColumn: function (aSecondary) {
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

    _appendLinkGroup(aTarget, aLinks, aClassName) {
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

    _createOwners: async function (aOwnerIds, aLink) {
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
                ownersList += `<a href="/addons/?user=${currOwner.username}">`;
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

    buildAddonPage: async function (aAddonSlug, aVersionHistory) {
        var addon = await gAPI.getAddon(aAddonSlug);
        if (!addon) {
            gSite.primary.main.innerText = "Invalid add-on.";
            gSite.doneLoading();
            return;
        }

        var addonType = await gAPI.getAddonTypeFromId(addon.type);
        gSite._setActiveNav(addonType.slug);

        gSite.primary.main.classList.add("two-col");
        var colPrimary = gSite._createAddonColumn();
        var colSecondary = gSite._createAddonColumn(true);

        gSite.primary.main.appendChild(colPrimary.container);
        gSite.primary.main.appendChild(colSecondary.container);

        var ilLicense = gSite._createIsland("License");
        var ilResources = gSite._createIsland("Resources");

        colPrimary.addonIcon.src = addonType.defaultIcon;
        if (addon.iconUrl) {
            colPrimary.addonIcon.src = addon.iconUrl;
        }

        // Identify add-on license
        var licenseText = "";
        var licenseUrl = `/addons/license?addon=${addon.slug}`;
        if (addon.license) {
            let licenses = await gAPI.getLicenses();
            licenseText = licenses.names[addon.license];
        } else {
            let ownersList = await gSite._createOwners(addon.owners);
            licenseText = `© ${new Date().getFullYear()} ${ownersList}`;
        }
        gSite._appendLink(ilLicense, licenseText, licenseUrl, true);

        // Add-on releases data
        var releaseData = null;
        if (addon.ghInfo) {
            releaseData = await gAPI.getReleases(addon.ghInfo);
        }
        var compatibilityData = null;
        if (addon.releasesUrl) {
            let response = await gAPI.request(addon.releasesUrl);
            let responseData = response.json;
            // Take compatibility information from static release data
            // if there is information from the GitHub API
            if (releaseData) {
                compatibilityData = responseData.data;
            } else {
                releaseData = responseData;
            }
        }
        if (releaseData == null) {
            gSite.primary.main.innerText = "Release data missing.";
            gSite.doneLoading();
            return;
        }

        // Show message thrown by API and return early
        if (releaseData.message) {
            gSite.primary.main.innerText = releaseData.message;
            gSite.doneLoading();
            return;
        }

        if (aVersionHistory) {
            let releaseDataEntries = Object.entries(releaseData.data)
            gSite._updateTitle(`${addon.name} - Versions`);
            gSite._appendLink(ilResources, "Add-on Details", `/addons/get?addon=${addon.slug}`, false);

            gSite._appendHtml(colPrimary.addonSummary, `${addon.name} Versions`, "h1");
            gSite._appendHtml(colPrimary.addonSummary, `${releaseDataEntries.length} releases`);

            let releaseList = document.createElement("div");
            colPrimary.content.appendChild(releaseList);

            for (let [version, release] of releaseDataEntries) {
                let listItem = gSite._createListItem();
                listItem.icon.remove();
                listItem.title.innerText = release.name;
                if (release.prerelease) {
                    gSite._appendBadge(listItem.title, "Pre-release", "prerelease");
                }
                if (release.datePublished) {
                    let dateString = gSite._formatDate(release.datePublished);
                    gSite._appendHtml(listItem.desc, `Released: ${dateString}`);
                }
                if (release.xpi.size) {
                    gSite._appendHtml(listItem.desc, `Size: ${Math.round(release.xpi.size / 1024)} KB`);
                }
                if (release.xpiDownloadCount) {
                    gSite._appendHtml(listItem.desc, `Downloads: ${release.xpiDownloadCount}`);
                }
                let releaseCompatibility = release.applications ||
                    (compatibilityData &&
                     compatibilityData[version].applications);
                if (releaseCompatibility) {
                    gSite._appendHtml(listItem.desc, "Works with:");
                    for (let j = 0; j < releaseCompatibility.length; j++) {
                        let compatInfo = releaseCompatibility[j];
                        let appInfo = await gAPI.getApplicationFromId(compatInfo.id);
                        gSite._appendHtml(listItem.desc, `${appInfo.displayName} ${compatInfo.minVersion} to ${compatInfo.maxVersion}`);
                    }
                }
                if (release.changelog) {
                    gSite._appendHtml(listItem.desc, await gSite._parseMarkdown(release.changelog));
                }

                let artifactLinks = [];
                if (release.xpi.url) {
                    gSite._appendInstallButton(
                        listItem.parentElement,
                        addon.name,
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
                gSite._appendLinkGroup(listItem.desc, artifactLinks, "addon-artifacts");
                releaseList.appendChild(listItem.parentElement);
            }
        } else {
            gSite._updateTitle(addon.name);
            gSite._appendLink(ilResources, "Version History", `/addons/versions?addon=${addon.slug}`, false);

            let version = releaseData.stable || releaseData.experimental;
            let release = releaseData.data[version];

            let ownersList = await gSite._createOwners(addon.owners, true);
            gSite._appendHtml(colPrimary.addonSummary, addon.name, "h1");
            gSite._appendHtml(colPrimary.addonSummary, `By ${ownersList}`);
            if (addon.description) {
                gSite._appendHtml(colPrimary.addonSummary, addon.description);
            }

            if (release) {
                if (release.name) {
                    var ilVersion = gSite._createIsland("Version");
                    colSecondary.content.appendChild(ilVersion);
                    gSite._appendHtml(ilVersion, release.name);
                }
                if (release.datePublished) {
                    var ilLastUpdated = gSite._createIsland("Last Updated");
                    colSecondary.content.appendChild(ilLastUpdated);
                    let releaseDate = gSite._formatDate(release.datePublished);
                    gSite._appendHtml(ilLastUpdated, releaseDate);
                }
                if (release.xpi.size) {
                    var ilSize = gSite._createIsland("Size");
                    colSecondary.content.appendChild(ilSize);
                    gSite._appendHtml(ilSize, `${Math.round(release.xpi.size / 1024)} KB`);
                }
                if (releaseData.totalDownloadCount) {
                    var ilDownloads = gSite._createIsland("Total Downloads");
                    colSecondary.content.appendChild(ilDownloads);
                    gSite._appendHtml(ilDownloads, releaseData.totalDownloadCount);
                }
                let releaseCompatibility = release.applications ||
                    (compatibilityData &&
                     compatibilityData[version].applications);
                if (releaseCompatibility) {
                    var ilCompatibility = gSite._createIsland("Compatibility");
                    colPrimary.content.appendChild(ilCompatibility);
                    for (let j = 0; j < releaseCompatibility.length; j++) {
                        let compatInfo = releaseCompatibility[j];
                        let appInfo = await gAPI.getApplicationFromId(compatInfo.id);
                        gSite._appendHtml(ilCompatibility, `${appInfo.displayName} ${compatInfo.minVersion} to ${compatInfo.maxVersion}`);
                    }
                }
                if (release.changelog) {
                    var ilChangelog = gSite._createIsland("Release Notes");
                    gSite._appendHtml(ilChangelog, await gSite._parseMarkdown(release.changelog));
                    colPrimary.content.appendChild(ilChangelog);
                }
                if (release.xpi.url) {
                    gSite._appendInstallButton(
                        colPrimary.addonInstall,
                        addon.name,
                        {
                            URL: release.xpi.url,
                            IconURL: addon.iconUrl,
                            Hash: release.xpi.hash
                        }
                    );
                }
            } else {
                var ilMessage = gSite._createIsland("Message");
                gSite._appendHtml(ilMessage, "This add-on has no releases.");
                colPrimary.content.appendChild(ilMessage);
            }
        }

        if (addon.supportEmail) {
            gSite._appendLink(ilResources, "Support E-mail", addon.supportEmail, true);
        }
        if (addon.supportUrl) {
            gSite._appendLink(ilResources, "Support Site", addon.supportUrl, true);
        }
        if (addon.repositoryUrl) {
            gSite._appendLink(ilResources, "Source Repository", addon.repositoryUrl, true);
        } else if (addon.ghInfo) {
            gSite._appendLink(ilResources, "Source Repository", gAPI.getRepositoryUrl(addon.ghInfo), true);
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
                    case "amo":
                        mirrorName += "Mozilla Add-ons Site";
                        mirrorUrl = MIRROR_AMO + addon.slug;
                        break;
                }
                gSite._appendLink(ilResources, mirrorName, mirrorUrl, true);
            }
        }

        colSecondary.content.appendChild(ilLicense);
        colSecondary.content.appendChild(ilResources);
    },

    buildLicensePage: async function (aAddonSlug) {
        var addon = await gAPI.getAddon(aAddonSlug);
        if (!addon) {
            gSite.primary.main.innerText = "Invalid add-on.";
            gSite.doneLoading();
            return;
        }

        var addonType = await gAPI.getAddonTypeFromId(addon.type);
        gSite._setActiveNav(addonType.slug);

        gSite._updateTitle(`${addon.name} - License`);

        if (addon.license && addon.license != "PD") {
            gSite.primary.main.innerText = "Redirecting to license page...";
            let licenseUrl;
            if (addon.license == "custom" && addon.licenseUrl) {
                licenseUrl = addon.licenseUrl;
            } else {
                licenseUrl = `${URL_LICENSE}/${addon.license}`;
            }
            window.location.href = licenseUrl;
            return;
        }

        var colPrimary = gSite._createAddonColumn();
        gSite.primary.main.appendChild(colPrimary.container);
        gSite.primary.main.classList.add("two-col");

        // License data
        var licenses = await gAPI.getLicenses();
        // Show message thrown by API and return early
        if (licenses.message) {
            gSite.primary.main.innerText = licenses.message;
            gSite.doneLoading();
            return;
        }

        colPrimary.addonIcon.src = addonType.defaultIcon;
        if (addon.iconUrl) {
            colPrimary.addonIcon.src = addon.iconUrl;
        }

        gSite._appendHtml(colPrimary.addonSummary, addon.name, "h1");
        var ownersList = await gSite._createOwners(addon.owners, true);
        gSite._appendHtml(colPrimary.addonSummary, `By ${ownersList}`);

        var ilLicense = gSite._createIsland("License");
        var licenseText = "";
        if (addon.license == "PD") {
            licenseText = licenses.licenseText["publicDomain"];
        } else {
            licenseText = licenses.licenseText["copyrighted"];
        }
        gSite._appendHtml(ilLicense, licenseText);
        colPrimary.content.appendChild(ilLicense);
    },

    _clearStorage: function () {
        console.log(`Clearing local storage`);
        localStorage.clear();
        localStorage.setItem("version", APP_VERSION);
    },

    _migrate: function () {
        let version = localStorage.getItem("version");
        if (version && version == APP_VERSION) {
            return;
        }
        gSite._clearStorage();
    },

    onLoad: async function () {
        gAppInfo.identify();
        gSite._migrate();
        gSite._addLoaderSection();
        gSite._addPrimarySection();

        var urlParameters = new URLSearchParams(window.location.search);
        if (urlParameters.has("reset")) {
            gSite._clearStorage();
        }
        var addonSlug = urlParameters.get("addon");

        switch (pageInfo.id) {
            // Category/User/Search
            case 0:
                var category = urlParameters.get("category");
                var user = urlParameters.get("user");
                var searchTerms = urlParameters.get("terms");
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
                    gSite.primary.main.innerText = "Missing add-on parameter.";
                    gSite.doneLoading();
                    return;
                }
                await gSite.buildAddonPage(addonSlug, pageInfo.versionHistory);
                break;
            case 2:
                if (!addonSlug) {
                    gSite.primary.main.innerText = "Missing add-on parameter.";
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
