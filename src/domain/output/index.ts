export {
  formatContentLine,
  prefixFor,
  isLive,
  liveState,
  manilaToday,
  type ContentTokens,
  type ContentType,
  type FormattedLine,
  type LiveState,
  type LiveWindow,
} from './sectionFormat.ts';

export {
  groupHotelsForOutput,
  SIMILAR_SUFFIX,
  type HotelForOutput,
  type HotelGroup,
} from './hotelGroups.ts';

export {
  formatClosingBlock,
  formatGreeting,
  BAD_PREFIX,
  GREAT_PREFIX,
  RATE_MY_SERVICE_HEADING,
  type ClosingBlockInput,
} from './closingBlock.ts';

export {
  buildQuotationModel,
  renderQuotation,
  outputFingerprint,
  toClipboardHtml,
  formatRateAmount,
  type OutputContentItem,
  type OutputHotel,
  type OutputIssue,
  type OutputIssueCode,
  type OutputPart,
  type OutputService,
  type QuotationModel,
  type QuotationModelInput,
  type QuotationSections,
  type RateLine,
} from './quotationOutput.ts';
