const APP_NAME = "Fresco";
const APP_VERSION = "0.0.1";
const APP_NAV = [
    {
        label: "All",
        url: "/addons"
    },
    {
        label: "Extensions",
        url: "/addons/?category=extensions"
    },
    {
        label: "Themes",
        url: "/addons/?category=themes"
    },
    {
        label: "Dictionaries",
        url: "/addons/?category=dictionaries"
    },
    {
        label: "Language Packs",
        url: "/addons/?category=language-packs"
    }
];

const METADATA_JSON = "assets/metadata.json";
const CONTENT_TYPE_XPI = "application/x-xpinstall";

const URL_GITHUB_API = "https://api.github.com/repos";
const URL_GITHUB = "https://github.com";
const URL_LICENSE = "https://opensource.org/licenses";

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
                data: [],
            };
            for (let ghRelease of response.json) {
                var release = {
                    name: ghRelease.name || ghRelease.tag_name,
                    changelog: ghRelease.body,
                    prerelease: ghRelease.prerelease,
                    datePublished: ghRelease.published_at,
                    dateCreated: ghRelease.created_at,
                    zipballUrl: ghRelease.zipball_url,
                    tarballUrl: ghRelease.tarball_url,
                    xpiUrl: "",
                    xpiHash: "",
                    xpiSize: 0,
                    xpiDownloadCount: 0,
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
                    release.xpiUrl = asset.browser_download_url;
                    release.xpiSize = asset.size;
                    release.xpiDownloadCount = asset.download_count;
                    releases.totalDownloadCount += asset.download_count;
                    break;
                }
                releases.data.push(release);
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
            let response = await this.request(METADATA_JSON);
            this._metadata = response.json;
        }
        return this._metadata;
    },

    getAddon: async function (aSlug) {
        let metadata = await this.getMetadata();
        var addon = metadata.addons.find(function (item) {
            return item.slug == aSlug;
        });
        return addon;
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
        let buttonIcon = document.createElement("img");
        button.append(buttonIcon);
        button.className = "button";
        buttonIcon.className = "button-icon";
        buttonIcon.src = "assets/images/download.png";

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

    _createList: function (aAddons, aDefaultIcon) {
        let list = document.createElement("div");
        list.className = "list";

        for (let i = 0; i < aAddons.length; i++) {
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
            listItem.desc.innerText = addon.description;

            // Download button
            if (addon.xpiUrl) {
                gSite._appendInstallButton(
                    listItem.parentElement,
                    addon.name,
                    {
                        URL: addon.xpiUrl,
                        IconURL: addon.iconUrl,
                        Hash: addon.hash
                    }
                );
            }
            
            if (addon.externalUrl) {
                listItem.parentElement.href = addon.externalUrl;
                listItem.parentElement.target = "_blank";
                gSite._appendBadge(listItem.title, "External");
            }

            if (addon.apiUrl || addon.ghInfo || addon.releasesUrl) {
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
        header.innerText = APP_NAME;
        section.header = header;

        // Navigation
        let navList = document.createElement("ul");
        for (let nav of APP_NAV) {
            let navItem = document.createElement("li");
            let navLink = document.createElement("a");
            navLink.href = nav.url;
            navLink.innerText = nav.label;
            navItem.appendChild(navLink);
            navList.appendChild(navItem);
        }
        section.navList = navList;

        let navContainer = document.createElement("nav");
        navContainer.id = "page-nav";
        navContainer.appendChild(navList);

        // Main
        let main = gSite._createInnerBox("main", "main");
        section.main = main;

        // Footer
        let footer = document.createElement("footer");
        footer.innerText = `This site is powered by ${APP_NAME} ${APP_VERSION}.`;
        section.footer = footer;

        section.content.appendChild(header);
        section.content.appendChild(navContainer);
        section.content.appendChild(main);
        section.content.appendChild(footer);
    },

    buildCategoryPage: async function (aTypeSlug, aHideInfo) {
        var listBox = document.createElement("div");
        listBox.id = "lists";
        gSite.primary.main.appendChild(listBox);
        
        let metadata = await gAPI.getMetadata();

        var types = metadata.types;
        for (let i = 0; i < types.length; i++) {
            let addonType = types[i];
            if (aTypeSlug) {
                if (addonType.slug != aTypeSlug) {
                    continue;
                }
                gSite._updateTitle(addonType.name);
            } else {
                gSite._updateTitle("All");
            }

            if (!aHideInfo) {
                let listTitle = document.createElement("h1");
                listTitle.innerText = addonType.name;
                listTitle.id = addonType.slug;
                listBox.append(listTitle);
                
                let listDescription = document.createElement("p");
                listDescription.innerText = addonType.description;
                listBox.append(listDescription);
            }

            let addons = metadata.addons.filter(function (item) {
                return item.type == addonType.type;
            }).sort(function (a, b) {
                return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
            });

            let list = gSite._createList(addons, addonType.defaultIcon);
            listBox.append(list);
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

    buildAddonPage: async function (aAddonSlug, aVersionHistory) {
        var addon = await gAPI.getAddon(aAddonSlug);
        if (!addon) {
            gSite.primary.main.innerText = "Invalid add-on.";
            gSite.doneLoading();
            return;
        }

        gSite.primary.main.classList.add("two-col");
        var colPrimary = gSite._createAddonColumn();
        var colSecondary = gSite._createAddonColumn(true);

        gSite.primary.main.appendChild(colPrimary.container);
        gSite.primary.main.appendChild(colSecondary.container);

        var ilLicense = gSite._createIsland("License");
        var ilResources = gSite._createIsland("Resources");

        colPrimary.addonIcon.src = addon.iconUrl;

        // Identify add-on license
        var licenseText = "";
        var licenseUrl = "#";
        if (addon.license) {
            let metadata = await gAPI.getMetadata();
            let licenses = metadata.licenses;
            licenseText = licenses[addon.license];
            switch (addon.license) {
                case "custom":
                    if (addon.licenseUrl) {
                        licenseUrl = addon.licenseUrl;
                    }
                    break;
                case "PD":
                    break;
                default:
                    licenseUrl = `${URL_LICENSE}/${addon.license}`;
                    break;
            }
        } else {
            licenseText = `© ${new Date().getFullYear()}`;
        }
        gSite._appendLink(ilLicense, licenseText, licenseUrl, true);

        // Add-on releases data
        var releaseData = null;
        if (addon.ghInfo) {
            releaseData = await gAPI.getReleases(addon.ghInfo);
        } else if (addon.releasesUrl) {
            let response = await gAPI.request(addon.releasesUrl);
            releaseData = response.json;
        } else {
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
            gSite._updateTitle(`${addon.name} - Versions`);
            gSite._appendLink(ilResources, "Add-on Details", `/addons/get?addon=${addon.slug}`, false);

            gSite._appendHtml(colPrimary.addonSummary, `${addon.name} Versions`, "h1");
            gSite._appendHtml(colPrimary.addonSummary, `${releaseData.data.length} releases`);

            let releaseList = document.createElement("div");
            colPrimary.content.appendChild(releaseList);

            for (let i = 0; i < releaseData.data.length; i++) {
                let release = releaseData.data[i];
                let listItem = gSite._createListItem();
                listItem.icon.remove();
                listItem.title.innerText = release.name;
                if (release.prerelease) {
                    gSite._appendBadge(listItem.title, "Pre-release", "prerelease");
                }
                if (release.xpiUrl) {
                    gSite._appendInstallButton(
                        listItem.parentElement,
                        addon.name,
                        {
                            URL: release.xpiUrl,
                            IconURL: addon.iconUrl,
                        }
                    );
                }
                if (release.datePublished) {
                    let dateString = gSite._formatDate(release.datePublished);
                    gSite._appendHtml(listItem.desc, `Released: ${dateString}`);
                }
                if (release.xpiSize) {
                    gSite._appendHtml(listItem.desc, `Size: ${Math.round(release.xpiSize / 1024)} KB`);
                }
                if (release.xpiDownloadCount) {
                    gSite._appendHtml(listItem.desc, `Downloads: ${release.xpiDownloadCount}`);
                }
                if (release.changelog) {
                    gSite._appendHtml(listItem.desc, await gSite._parseMarkdown(release.changelog));
                }
                releaseList.appendChild(listItem.parentElement);
            }
        } else {
            gSite._updateTitle(addon.name);
            gSite._appendLink(ilResources, "Version History", `/addons/versions?addon=${addon.slug}`, false);

            let release = releaseData.data[0];

            gSite._appendHtml(colPrimary.addonSummary, addon.name, "h1");
            gSite._appendHtml(colPrimary.addonSummary, `By ${release.author.name}`);
            gSite._appendHtml(colPrimary.addonSummary, addon.description);

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
            if (release.xpiSize) {
                var ilSize = gSite._createIsland("Size");
                colSecondary.content.appendChild(ilSize);
                gSite._appendHtml(ilSize, `${Math.round(release.xpiSize / 1024)} KB`);
            }
            if (releaseData.totalDownloadCount) {
                var ilDownloads = gSite._createIsland("Total Downloads");
                colSecondary.content.appendChild(ilDownloads);
                gSite._appendHtml(ilDownloads, releaseData.totalDownloadCount);
            }

            if (release.changelog) {
                var ilChangelog = gSite._createIsland("Release Notes");
                gSite._appendHtml(ilChangelog, await gSite._parseMarkdown(release.changelog));
                colPrimary.content.appendChild(ilChangelog);
            }
            if (release.tarballUrl) {
                // resourceLinks.tarball.href = release.tarballUrl;
            }
            if (release.zipballUrl) {
                // resourceLinks.zipball.href = release.zipballUrl;
            }
            if (release.xpiUrl) {
                // resourceLinks.xpi.href = release.xpiUrl;
                gSite._appendInstallButton(
                    colPrimary.addonInstall,
                    addon.name,
                    {
                        URL: release.xpiUrl,
                        IconURL: addon.iconUrl,
                    }
                );
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

        colSecondary.content.appendChild(ilLicense);
        colSecondary.content.appendChild(ilResources);
    },

    onLoad: async function () {
        gAppInfo.identify();
        gSite._addLoaderSection();
        gSite._addPrimarySection();

        var urlParameters = new URLSearchParams(window.location.search);

        switch (pageInfo.id) {
            // Category
            case 0:
                let category = urlParameters.get("category");
                await gSite.buildCategoryPage(category);
                break;
            // Add-on
            case 1:
                let addonSlug = urlParameters.get("addon");
                if (!addonSlug) {
                    gSite.primary.main.innerText = "Missing add-on parameter.";
                    gSite.doneLoading();
                    return;
                }
                await gSite.buildAddonPage(addonSlug, pageInfo.versionHistory);
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
