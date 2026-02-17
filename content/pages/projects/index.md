---
type: ProjectFeedLayout
title: Projects
metaTitle: Projects
metaDescription: Featured behavioural analytics project by Nikunj Prajapati.
socialImage: /images/featured-Image2.jpg
colors: colors-a
backgroundImage:
  type: BackgroundImage
  url: /images/bg3.jpg
  backgroundSize: cover
  backgroundPosition: center
  backgroundRepeat: no-repeat
  opacity: 55
projectFeed:
  type: ProjectFeedSection
  colors: colors-f
  showDate: true
  showDescription: true
  showReadMoreLink: true
  showFeaturedImage: true
  variant: variant-a
  styles:
    self:
      width: narrow
      padding:
        - pt-0
        - pl-4
        - pr-4
        - pb-12
topSections:
  - type: HeroSection
    title: Project
    subtitle: Featured behavioural movement analysis research project.
    actions: []
    colors: colors-f
    backgroundSize: full
    elementId: projects-hero
    styles:
      self:
        height: auto
        width: narrow
        padding:
          - pt-16
          - pb-16
          - pl-4
          - pr-4
        flexDirection: row
        textAlign: left
bottomSections:
  - type: ContactSection
    backgroundSize: full
    title: Working on something data driven?
    colors: colors-f
    form:
      type: FormBlock
      elementId: contact-projects
      fields:
        - type: TextFormControl
          name: firstName
          label: First Name
          hideLabel: true
          placeholder: First Name
          isRequired: true
          width: 1/2
        - type: TextFormControl
          name: lastName
          label: Last Name
          hideLabel: true
          placeholder: Last Name
          isRequired: false
          width: 1/2
        - type: EmailFormControl
          name: email
          label: Email
          hideLabel: true
          placeholder: Email
          isRequired: true
          width: full
        - type: TextareaFormControl
          name: message
          label: Message
          hideLabel: true
          placeholder: Share your dataset or project context
          isRequired: true
          width: full
      submitLabel: Send message
      styles:
        self:
          textAlign: center
    styles:
      self:
        height: auto
        width: narrow
        margin:
          - mt-0
          - mb-0
          - ml-4
          - mr-4
        padding:
          - pt-24
          - pb-24
          - pr-4
          - pl-4
        flexDirection: row
        textAlign: left
---
