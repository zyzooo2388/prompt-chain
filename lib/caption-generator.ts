export type CaptionFlavorOption = {
  id: string;
  name: string;
  tone: string;
};

export type GenerateCaptionsInput = {
  flavor: CaptionFlavorOption;
  imageFile: File;
};

export async function generateCaptionsStub({
  flavor,
  imageFile,
}: GenerateCaptionsInput): Promise<string[]> {
  // TODO(Assignment 5): Replace this stub with a real REST call to the
  // caption-generation endpoint once the API is available.
  // Example shape:
  // const formData = new FormData();
  // formData.append("image", imageFile);
  // formData.append("flavorId", flavor.id);
  // const response = await fetch("/api/assignment-5/captions", {
  //   method: "POST",
  //   body: formData,
  // });

  await new Promise((resolve) => setTimeout(resolve, 1200));

  const baseName = imageFile.name.replace(/\.[^.]+$/, "") || "uploaded image";

  return [
    `${flavor.name}: "${baseName}" looks like it is trying very hard to be iconic.`,
    `${flavor.name}: A ${flavor.tone.toLowerCase()} take on ${baseName}, now with extra visual confidence.`,
    `${flavor.name}: ${baseName} arrives on the timeline like it absolutely planned this moment.`,
  ];
}
