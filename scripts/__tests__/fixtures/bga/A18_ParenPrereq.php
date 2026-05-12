<?php
namespace AGR\Cards;
class A18_ParenPrereq extends Card
{
  public function __construct()
  {
    $this->name = clienttranslate('Paren Prereq Card');
    $this->deck = 'A';
    $this->number = 18;
    $this->prerequisite = ('2 Occupations');
  }
}
