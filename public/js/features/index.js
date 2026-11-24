// Feature plug-ins (client). Each module in this folder exports { routes: [[regex, (m,q)=>view, sectionKey?]] }.
// Add a module: import it below and add it to MODS.
import * as newToIslam from './new-to-islam.js';
import * as worshipPlus from './worship-plus.js';
import * as socialPlus2 from './social-plus2.js';
import * as muslimTools from './muslim-tools.js';
import * as knowledgePlus from './knowledge-plus.js';
import * as barakahWealth from './barakah-wealth.js';
import * as engage from './engage.js';
import * as nasheeds from './nasheeds.js';
import * as study from './study.js';
import * as learnArabic from './learn-arabic.js';
import * as quests from './quests.js';
import * as momentum from './momentum.js';
const MODS = [newToIslam, worshipPlus, socialPlus2, muslimTools, knowledgePlus, barakahWealth, engage, nasheeds, study, learnArabic, quests, momentum];
export const FEATURE_ROUTES = () => MODS.flatMap(m => m.routes || []);
export const FEATURE_MENU = () => MODS.flatMap(m => m.menu || []);
