/**
 * Labels that keep this-VIN records and year/make/model notes from mixing.
 *
 * The same strings are used on the paid report, the sample, and the PDF so a
 * buyer never sees one wording on screen and another in the attachment.
 */
export const THIS_VIN_CHIP = "This VIN";
export const NOT_THIS_VIN_CHIP = "Not this VIN";

export const FROM_THIS_VIN = "From this VIN";
export const COMMON_FOR_MODEL = "Common for this model — not this VIN";
export const QUESTIONS_HEADING = "Questions to ask the seller";

export const MODEL_ZONE_TITLE = "About this model (not this VIN)";
export const MODEL_ZONE_NAV = "This model";
export const MODEL_ZONE_NOTE =
  "Public records and known issues for this year, make and model — not the history of this VIN.";

/** VIN-build specs on the vehicle card — not EPA model averages. */
export const VIN_SPECS_TITLE = "Vehicle specifications";
export const VIN_SPECS_NOTE =
  "From the VIN build record and listing fields on this report.";
export const VIN_SPECS_OPEN = "Show specifications";

/** City/highway estimates that arrived on the VIN build record. */
export const SPEC_MPG_TITLE = "Gas mileage";
export const SPEC_MPG_NOTE =
  "City and highway estimates from the VIN build record on this report.";

/** Spec sheet groups — same wording on HTML, sample, and PDF. */
export const SPEC_GROUP_POWERTRAIN = "Powertrain";
export const SPEC_GROUP_BODY = "Body & dimensions";
export const SPEC_GROUP_FEATURES = "Equipment";
export const SPEC_GROUP_PRICE = "Manufacturer pricing";
export const SPEC_GROUP_MORE = "More specifications";

/** EPA MPG is a model-year listing, never a reading from this VIN. */
export const EPA_MPG_TITLE = "EPA fuel economy";
export const EPA_MPG_NOTE =
  "EPA listing for this model year, when it matches the engine on this report — not this VIN.";

export const SAFETY_RATINGS_TITLE = "NHTSA 5-Star safety ratings";
export const SAFETY_RATINGS_NOTE =
  "NHTSA crash-test ratings for this model year — not this VIN.";

export const EPA_OWNERSHIP_TITLE = "Ownership costs & emissions";
export const EPA_OWNERSHIP_NOTE =
  "EPA estimates for this model year, when they match the engine on this report — not this VIN. Fuel costs are estimates.";

export const EPA_EV_TITLE = "Electric range & charging";
export const EPA_EV_NOTE =
  "EPA listing for this electric or plug-in hybrid model year, when it matches the powertrain on this report — not this VIN.";
